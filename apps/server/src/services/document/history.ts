import { buildWorkspaceWhere } from '@lobechat/database';
import type { DocumentItem } from '@lobechat/database/schemas';
import { documentHistories, documents, users } from '@lobechat/database/schemas';
import { and, desc, eq, gte, inArray, lt, or, type SQL } from 'drizzle-orm';

import {
  DOCUMENT_HISTORY_AUTOSAVE_WINDOW_MS,
  DOCUMENT_HISTORY_QUERY_LIST_LIMIT,
  DOCUMENT_HISTORY_SOURCE_LIMITS,
} from '@/const/documentHistory';
import { KnowledgeBaseAccessGrantModel } from '@/database/models/knowledgeBaseAccessGrant';
import type { LobeChatDatabase } from '@/database/type';
import { isValidEditorData } from '@/libs/editor/isValidEditorData';
import { coerceHistoryEditorDocument } from '@/libs/editor/normalizeHistoryEditorData';

import type {
  CompareDocumentHistoryItemsParams,
  CompareDocumentHistoryItemsResult,
  DatabaseLike,
  DocumentHistoryAccessOptions,
  DocumentHistoryAttribution,
  DocumentHistoryItemResult,
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
  GetDocumentHistoryItemParams,
  ListDocumentHistoryParams,
  ListDocumentHistoryResult,
} from './types';

const mergeEditorIds = (...lists: (readonly string[] | null | undefined)[]) => {
  const merged = [...new Set(lists.flatMap((list) => list ?? []))];
  return merged.length > 0 ? merged : null;
};

const getDocumentEditorData = (document: DocumentItem | undefined): Record<string, any> | null => {
  const editorData = document?.editorData;

  return isValidEditorData(editorData) ? editorData : null;
};

export class DocumentHistoryService {
  private readonly db: DatabaseLike;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: DatabaseLike, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  private documentsOwnership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, documents);

  private historiesOwnership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, documentHistories);

  /**
   * Personal mode: history belongs to the document, not the editor. Shared
   * libraries need that so a grantee's save can append a version (and so the
   * updateDocument transaction is not rolled back at createHistory). Workspace
   * mode keeps the existing workspace-scoped ownership predicate.
   */
  private documentHistoryScope = (documentId: string): SQL =>
    this.workspaceId
      ? and(eq(documentHistories.documentId, documentId), this.historiesOwnership())!
      : eq(documentHistories.documentId, documentId);

  private resolveWritableDocument = async (documentId: string) => {
    const [owned] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), this.documentsOwnership()))
      .limit(1);
    if (owned) return owned;

    if (this.workspaceId) return null;

    const canEdit = await KnowledgeBaseAccessGrantModel.canPerformOnDocument(
      this.db as LobeChatDatabase,
      documentId,
      this.userId,
      'edit',
    );
    if (!canEdit) return null;

    const [shared] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    return shared ?? null;
  };

  createHistory = async (
    params: DocumentHistoryAttribution & {
      breakAutosaveWindow?: boolean;
      documentId: string;
      editorData: Record<string, any>;
      saveSource: DocumentHistorySaveSource;
      savedAt: Date;
    },
  ) => {
    const document = await this.resolveWritableDocument(params.documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const historyScope = this.documentHistoryScope(params.documentId);
    const editorIds = mergeEditorIds(params.editorIds);

    // One agent run keeps one version: the state before its first edit. Later
    // edits of the same run only join their editors to it.
    if (params.saveSource === 'llm_call' && params.operationId) {
      const existing = await this.db.query.documentHistories.findFirst({
        where: and(historyScope, eq(documentHistories.operationId, params.operationId)),
      });

      if (existing) {
        if (editorIds) {
          await this.db
            .update(documentHistories)
            .set({ editorIds: mergeEditorIds(existing.editorIds, editorIds) })
            .where(and(eq(documentHistories.id, existing.id), historyScope));
        }
        return { id: existing.id, savedAt: existing.savedAt };
      }
    }

    // Autosave versions coalesce into fixed 10-min windows (Notion-like),
    // bucketed on the clock grid so the anchor stays immutable even though the
    // overwritten row's savedAt keeps moving — a sliding anchor would collapse
    // an entire continuous editing session into a single version.
    // Any non-autosave version in between closes the window.
    if (params.saveSource === 'autosave' && !params.breakAutosaveWindow) {
      const latest = await this.db.query.documentHistories.findFirst({
        orderBy: [desc(documentHistories.savedAt), desc(documentHistories.id)],
        where: historyScope,
      });

      const withinWindow =
        latest?.saveSource === 'autosave' &&
        Math.floor(latest.savedAt.getTime() / DOCUMENT_HISTORY_AUTOSAVE_WINDOW_MS) ===
          Math.floor(params.savedAt.getTime() / DOCUMENT_HISTORY_AUTOSAVE_WINDOW_MS);

      if (withinWindow) {
        await this.db
          .update(documentHistories)
          .set({
            editorData: params.editorData,
            editorIds: editorIds
              ? mergeEditorIds(latest.editorIds ?? [latest.userId], editorIds)
              : latest.editorIds,
            savedAt: params.savedAt,
          })
          .where(and(eq(documentHistories.id, latest.id), historyScope));

        return { id: latest.id, savedAt: params.savedAt };
      }
    }

    const [history] = await this.db
      .insert(documentHistories)
      .values({
        agentId: params.agentId ?? null,
        documentId: params.documentId,
        editorData: params.editorData,
        editorIds,
        operationId: params.operationId ?? null,
        saveSource: params.saveSource,
        savedAt: params.savedAt,
        userId: editorIds?.[0] ?? this.userId,
        workspaceId: this.workspaceId ?? null,
      })
      .returning({ id: documentHistories.id });

    await this.trimHistoryBySource(params.documentId, params.saveSource);

    return { id: history!.id, savedAt: params.savedAt };
  };

  compareDocumentHistoryItems = async (
    params: CompareDocumentHistoryItemsParams,
    options?: DocumentHistoryAccessOptions,
  ): Promise<CompareDocumentHistoryItemsResult> => {
    const [from, to] = await Promise.all([
      this.getDocumentHistoryItem(
        { documentId: params.documentId, historyId: params.fromHistoryId },
        options,
      ),
      this.getDocumentHistoryItem(
        { documentId: params.documentId, historyId: params.toHistoryId },
        options,
      ),
    ]);

    return { from, to };
  };

  getDocumentHistoryItem = async (
    params: GetDocumentHistoryItemParams,
    options?: DocumentHistoryAccessOptions,
  ): Promise<DocumentHistoryItemResult> => {
    const headDocument = await this.findHeadDocument(params.documentId);

    if (!headDocument) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    // Treat 'head' as a special historyId representing the current document state
    if (params.historyId === 'head') {
      return {
        editorData: getDocumentEditorData(headDocument),
        id: 'head',
        isCurrent: true,
        saveSource: 'system',
        savedAt: headDocument.updatedAt,
      };
    }

    const historyRow = await this.db.query.documentHistories.findFirst({
      where: and(
        eq(documentHistories.id, params.historyId),
        this.documentHistoryScope(params.documentId),
        options?.historySince ? gte(documentHistories.savedAt, options.historySince) : undefined,
      ),
    });

    if (!historyRow) {
      throw new Error(`Document history item not found: ${params.documentId}@${params.historyId}`);
    }

    return {
      // Wrap bare Lexical roots so restore/diff clients always see `{ root }`.
      editorData: coerceHistoryEditorDocument(historyRow.editorData) as Record<string, any> | null,
      id: historyRow.id,
      isCurrent: false,
      saveSource: historyRow.saveSource as DocumentHistorySaveSource,
      savedAt: historyRow.savedAt,
    };
  };

  listDocumentHistory = async (
    params: ListDocumentHistoryParams,
    options?: DocumentHistoryAccessOptions,
  ): Promise<ListDocumentHistoryResult> => {
    const limit = Math.min(params.limit ?? DOCUMENT_HISTORY_QUERY_LIST_LIMIT, 100);
    const headDocument = await this.findHeadDocument(params.documentId);

    if (!headDocument) {
      return { items: [] };
    }

    const includeCurrent = params.includeCurrent ?? true;
    // Head is a synthetic "current" item that always sorts first.
    // Once pagination starts (beforeSavedAt is defined), head has already been passed.
    const shouldIncludeHead = includeCurrent && params.beforeSavedAt === undefined;

    // When head is included, it occupies one slot. To avoid dropping a history
    // row that would then be skipped by an exclusive cursor, we query enough
    // rows so that we can return (limit - 1) history items plus head while
    // basing the cursor on the last returned row (not a dropped one).
    const effectiveLimit = shouldIncludeHead ? Math.max(limit, 2) : limit;

    const historyRows = await this.db.query.documentHistories.findMany({
      limit: effectiveLimit,
      orderBy: [desc(documentHistories.savedAt), desc(documentHistories.id)],
      where: and(
        this.documentHistoryScope(params.documentId),
        options?.historySince ? gte(documentHistories.savedAt, options.historySince) : undefined,
        params.beforeSavedAt !== undefined && params.beforeId !== undefined
          ? or(
              lt(documentHistories.savedAt, params.beforeSavedAt),
              and(
                eq(documentHistories.savedAt, params.beforeSavedAt),
                lt(documentHistories.id, params.beforeId),
              ),
            )
          : params.beforeSavedAt !== undefined
            ? lt(documentHistories.savedAt, params.beforeSavedAt)
            : undefined,
      ),
    });

    const items: DocumentHistoryListItem[] = [];

    if (shouldIncludeHead) {
      items.push({
        id: 'head',
        isCurrent: true,
        saveSource: 'system',
        savedAt: headDocument.updatedAt,
        userId: headDocument.userId,
      });
    }

    const historyItems = historyRows.map((row) => ({
      agentId: row.agentId,
      editorIds: row.editorIds,
      id: row.id,
      isCurrent: false,
      saveSource: row.saveSource as DocumentHistorySaveSource,
      savedAt: row.savedAt,
      userId: row.userId,
    }));

    // If head consumed a slot and we fetched a full page of history rows,
    // drop the last history item so total count respects the limit.
    if (shouldIncludeHead && historyRows.length === effectiveLimit) {
      items.push(...historyItems.slice(0, -1));
    } else {
      items.push(...historyItems);
    }

    await this.attachEditors(items);

    const hasMore = historyRows.length === effectiveLimit && historyRows.length > 0;

    // Cursor must be based on the last item actually returned, not a dropped row.
    // For head + full page, the last returned history row is the penultimate DB row.
    const lastRow = hasMore
      ? shouldIncludeHead
        ? historyRows.at(-2)
        : historyRows.at(-1)
      : undefined;

    return {
      items,
      nextBeforeId: lastRow?.id,
      nextBeforeSavedAt: lastRow?.savedAt,
    };
  };

  /** Batch-load display profiles for every attributed editor on the page. */
  private attachEditors = async (items: DocumentHistoryListItem[]) => {
    const userIds = [...new Set(items.map((item) => item.userId).filter(Boolean))];
    if (userIds.length === 0) return;

    const rows = await this.db
      .select({
        avatar: users.avatar,
        fullName: users.fullName,
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const item of items) {
      item.editor = byId.get(item.userId) ?? null;
    }
  };

  private findHeadDocument = async (documentId: string) => {
    const owned = await this.db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), this.documentsOwnership()),
    });
    if (owned || this.workspaceId) return owned;

    const canBrowse = await KnowledgeBaseAccessGrantModel.canPerformOnDocument(
      this.db as LobeChatDatabase,
      documentId,
      this.userId,
      'view',
    );
    if (!canBrowse) return undefined;

    return this.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });
  };

  private trimHistoryBySource = async (
    documentId: string,
    saveSource: DocumentHistorySaveSource,
  ) => {
    const limit = DOCUMENT_HISTORY_SOURCE_LIMITS[saveSource];
    const BATCH_SIZE = 100;
    const historyScope = this.documentHistoryScope(documentId);

    const rowsToDelete = await this.db
      .select({ id: documentHistories.id })
      .from(documentHistories)
      .where(and(historyScope, eq(documentHistories.saveSource, saveSource)))
      .orderBy(desc(documentHistories.savedAt), desc(documentHistories.id))
      .offset(limit)
      .limit(BATCH_SIZE);

    if (rowsToDelete.length === 0) return;

    await this.db.delete(documentHistories).where(
      and(
        historyScope,
        eq(documentHistories.saveSource, saveSource),
        inArray(
          documentHistories.id,
          rowsToDelete.map((r) => r.id),
        ),
      ),
    );
  };
}
