import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';
import {
  DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL,
  KNOWLEDGE_BASE_GRANT_ACCESS_RANK,
  knowledgeBaseGrantAccessAtLeast,
} from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { and, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import {
  documents,
  knowledgeBaseAccessGrants,
  knowledgeBaseFiles,
  knowledgeBases,
  knowledgeBaseShareInvites,
  users,
} from '../schemas';
import type { LobeChatDatabase } from '../type';
import { createNanoId } from '../utils/idGenerator';
import { isUserKnowledgeBase } from '../utils/knowledgeBaseType';
import { notTrashed } from '../utils/softDelete';

const SHAREABLE_USER_LIMIT = 20;

export type PersonalKnowledgeBaseAccess = 'owner' | 'userGrant' | 'public' | null;

export type PersonalKnowledgeBaseAccessLevel = KnowledgeBaseGrantAccessLevel | 'owner';

const maxAccessLevel = (
  a: KnowledgeBaseGrantAccessLevel,
  b: KnowledgeBaseGrantAccessLevel,
): KnowledgeBaseGrantAccessLevel =>
  KNOWLEDGE_BASE_GRANT_ACCESS_RANK[a] >= KNOWLEDGE_BASE_GRANT_ACCESS_RANK[b] ? a : b;

const asAccessLevel = (value: string | null | undefined): KnowledgeBaseGrantAccessLevel => {
  if (value === 'edit' || value === 'delete' || value === 'full' || value === 'view') return value;
  return DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL;
};

/**
 * Personal-space knowledge-base grants (per-user / all-users) and invite links.
 * Workspace Cloud collaboration stays on `resource_permissions`.
 */
export class KnowledgeBaseAccessGrantModel {
  private db: LobeChatDatabase;
  private userId: string;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  /**
   * Knowledge base ids the caller may browse and mount in personal mode:
   * explicit user grants plus any library shared with all registered users.
   * Owners are not listed here — callers union with ownership separately.
   */
  static listGrantedKnowledgeBaseIds = async (
    db: LobeChatDatabase,
    userId: string,
  ): Promise<string[]> => {
    const rows = await KnowledgeBaseAccessGrantModel.listGrantedKnowledgeBaseRows(db, userId);
    return [...new Set(rows.map((row) => row.knowledgeBaseId))];
  };

  /** Per-grant rows (a KB may appear twice if both user and all grants exist). */
  static listGrantedKnowledgeBaseRows = async (
    db: LobeChatDatabase,
    userId: string,
  ): Promise<
    Array<{
      accessLevel: KnowledgeBaseGrantAccessLevel;
      knowledgeBaseId: string;
      subjectType: 'user' | 'all';
    }>
  > => {
    const rows = await db
      .select({
        accessLevel: sql<string>`"knowledge_base_access_grants"."access_level"`,
        knowledgeBaseId: knowledgeBaseAccessGrants.knowledgeBaseId,
        subjectType: knowledgeBaseAccessGrants.subjectType,
      })
      .from(knowledgeBaseAccessGrants)
      .innerJoin(
        knowledgeBases,
        and(
          eq(knowledgeBases.id, knowledgeBaseAccessGrants.knowledgeBaseId),
          isNull(knowledgeBases.workspaceId),
          notTrashed(knowledgeBases.isDeleted),
          isUserKnowledgeBase(),
        ),
      )
      .where(
        or(
          and(
            eq(knowledgeBaseAccessGrants.subjectType, 'user'),
            eq(knowledgeBaseAccessGrants.userId, userId),
          ),
          and(
            eq(knowledgeBaseAccessGrants.subjectType, 'all'),
            isNull(knowledgeBaseAccessGrants.userId),
          ),
        ),
      );

    return rows.map((row) => ({
      accessLevel: asAccessLevel(row.accessLevel),
      knowledgeBaseId: row.knowledgeBaseId,
      subjectType: row.subjectType as 'user' | 'all',
    }));
  };

  /**
   * How the caller reaches a personal knowledge base, or `null` if none.
   * Workspace-scoped libraries always return `null` here — use resource
   * permissions instead.
   */
  static resolveAccess = async (
    db: LobeChatDatabase,
    knowledgeBaseId: string,
    userId: string,
  ): Promise<PersonalKnowledgeBaseAccess> => {
    const [kb] = await db
      .select({
        userId: knowledgeBases.userId,
        workspaceId: knowledgeBases.workspaceId,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, knowledgeBaseId),
          notTrashed(knowledgeBases.isDeleted),
          isUserKnowledgeBase(),
        ),
      )
      .limit(1);

    if (!kb || kb.workspaceId) return null;
    if (kb.userId === userId) return 'owner';

    const rows = await db
      .select({ subjectType: knowledgeBaseAccessGrants.subjectType })
      .from(knowledgeBaseAccessGrants)
      .where(
        and(
          eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
          or(
            and(
              eq(knowledgeBaseAccessGrants.subjectType, 'user'),
              eq(knowledgeBaseAccessGrants.userId, userId),
            ),
            and(
              eq(knowledgeBaseAccessGrants.subjectType, 'all'),
              isNull(knowledgeBaseAccessGrants.userId),
            ),
          ),
        ),
      );

    if (rows.length === 0) return null;
    if (rows.some((row) => row.subjectType === 'user')) return 'userGrant';
    return 'public';
  };

  /**
   * Effective content permission for the caller on a personal knowledge base.
   * When both a user grant and an `all` grant exist, the higher level wins.
   */
  static resolveAccessLevel = async (
    db: LobeChatDatabase,
    knowledgeBaseId: string,
    userId: string,
  ): Promise<PersonalKnowledgeBaseAccessLevel | null> => {
    const [kb] = await db
      .select({
        userId: knowledgeBases.userId,
        workspaceId: knowledgeBases.workspaceId,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, knowledgeBaseId),
          notTrashed(knowledgeBases.isDeleted),
          isUserKnowledgeBase(),
        ),
      )
      .limit(1);

    if (!kb || kb.workspaceId) return null;
    if (kb.userId === userId) return 'owner';

    const rows = await db
      .select({
        accessLevel: sql<string>`"knowledge_base_access_grants"."access_level"`,
      })
      .from(knowledgeBaseAccessGrants)
      .where(
        and(
          eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
          or(
            and(
              eq(knowledgeBaseAccessGrants.subjectType, 'user'),
              eq(knowledgeBaseAccessGrants.userId, userId),
            ),
            and(
              eq(knowledgeBaseAccessGrants.subjectType, 'all'),
              isNull(knowledgeBaseAccessGrants.userId),
            ),
          ),
        ),
      );

    if (rows.length === 0) return null;

    return rows
      .map((row) => asAccessLevel(row.accessLevel))
      .reduce((best, level) => maxAccessLevel(best, level));
  };

  static canBrowse = async (
    db: LobeChatDatabase,
    knowledgeBaseId: string,
    userId: string,
  ): Promise<boolean> => {
    return (
      (await KnowledgeBaseAccessGrantModel.resolveAccessLevel(db, knowledgeBaseId, userId)) !== null
    );
  };

  /** Whether any personal-share grant row exists (per-user or all-users). */
  static hasAnyGrant = async (db: LobeChatDatabase, knowledgeBaseId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: knowledgeBaseAccessGrants.id })
      .from(knowledgeBaseAccessGrants)
      .where(eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId))
      .limit(1);
    return Boolean(row);
  };

  /** Knowledge-base ids that already have at least one personal-share grant. */
  static knowledgeBaseIdsWithGrants = async (
    db: LobeChatDatabase,
    knowledgeBaseIds: string[],
  ): Promise<Set<string>> => {
    if (knowledgeBaseIds.length === 0) return new Set();

    const rows = await db
      .selectDistinct({ knowledgeBaseId: knowledgeBaseAccessGrants.knowledgeBaseId })
      .from(knowledgeBaseAccessGrants)
      .where(inArray(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseIds));

    return new Set(rows.map((row) => row.knowledgeBaseId));
  };

  static canPerform = async (
    db: LobeChatDatabase,
    knowledgeBaseId: string,
    userId: string,
    required: KnowledgeBaseGrantAccessLevel,
  ): Promise<boolean> => {
    const level = await KnowledgeBaseAccessGrantModel.resolveAccessLevel(
      db,
      knowledgeBaseId,
      userId,
    );
    if (!level) return false;
    if (level === 'owner') return true;
    return knowledgeBaseGrantAccessAtLeast(level, required);
  };

  private static betterAccessLevel = (
    a: PersonalKnowledgeBaseAccessLevel | null,
    b: PersonalKnowledgeBaseAccessLevel | null,
  ): PersonalKnowledgeBaseAccessLevel | null => {
    if (!a) return b;
    if (!b) return a;
    if (a === 'owner' || b === 'owner') return 'owner';
    return maxAccessLevel(a, b);
  };

  private static maxGrantLevelForKnowledgeBases = async (
    db: LobeChatDatabase,
    knowledgeBaseIds: string[],
    userId: string,
  ): Promise<PersonalKnowledgeBaseAccessLevel | null> => {
    if (knowledgeBaseIds.length === 0) return null;

    const kbRows = await db
      .select({
        id: knowledgeBases.id,
        userId: knowledgeBases.userId,
      })
      .from(knowledgeBases)
      .where(
        and(
          inArray(knowledgeBases.id, knowledgeBaseIds),
          isNull(knowledgeBases.workspaceId),
          notTrashed(knowledgeBases.isDeleted),
          isUserKnowledgeBase(),
        ),
      );

    if (kbRows.length === 0) return null;
    if (kbRows.some((row) => row.userId === userId)) return 'owner';

    const personalIds = kbRows.map((row) => row.id);
    const grantRows = await db
      .select({
        accessLevel: sql<string>`"knowledge_base_access_grants"."access_level"`,
      })
      .from(knowledgeBaseAccessGrants)
      .where(
        and(
          inArray(knowledgeBaseAccessGrants.knowledgeBaseId, personalIds),
          or(
            and(
              eq(knowledgeBaseAccessGrants.subjectType, 'user'),
              eq(knowledgeBaseAccessGrants.userId, userId),
            ),
            and(
              eq(knowledgeBaseAccessGrants.subjectType, 'all'),
              isNull(knowledgeBaseAccessGrants.userId),
            ),
          ),
        ),
      );

    if (grantRows.length === 0) return null;
    return grantRows
      .map((row) => asAccessLevel(row.accessLevel))
      .reduce((best, level) => maxAccessLevel(best, level));
  };

  /**
   * Effective personal-share level for a file via any personal library that
   * contains it (`knowledge_base_files`). Workspace libraries are ignored.
   */
  static resolveAccessLevelForFile = async (
    db: LobeChatDatabase,
    fileId: string,
    userId: string,
  ): Promise<PersonalKnowledgeBaseAccessLevel | null> => {
    const rows = await db
      .select({ knowledgeBaseId: knowledgeBaseFiles.knowledgeBaseId })
      .from(knowledgeBaseFiles)
      .where(eq(knowledgeBaseFiles.fileId, fileId));

    return KnowledgeBaseAccessGrantModel.maxGrantLevelForKnowledgeBases(
      db,
      rows.map((row) => row.knowledgeBaseId),
      userId,
    );
  };

  /**
   * Effective personal-share level for a document: direct `knowledgeBaseId`,
   * and/or the parent file's library membership when `fileId` is set.
   */
  static resolveAccessLevelForDocument = async (
    db: LobeChatDatabase,
    documentId: string,
    userId: string,
  ): Promise<PersonalKnowledgeBaseAccessLevel | null> => {
    const [doc] = await db
      .select({
        fileId: documents.fileId,
        knowledgeBaseId: documents.knowledgeBaseId,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) return null;

    let level: PersonalKnowledgeBaseAccessLevel | null = null;
    if (doc.knowledgeBaseId) {
      level = await KnowledgeBaseAccessGrantModel.resolveAccessLevel(
        db,
        doc.knowledgeBaseId,
        userId,
      );
    }
    if (doc.fileId) {
      const viaFile = await KnowledgeBaseAccessGrantModel.resolveAccessLevelForFile(
        db,
        doc.fileId,
        userId,
      );
      level = KnowledgeBaseAccessGrantModel.betterAccessLevel(level, viaFile);
    }
    return level;
  };

  static canPerformOnFile = async (
    db: LobeChatDatabase,
    fileId: string,
    userId: string,
    required: KnowledgeBaseGrantAccessLevel,
  ): Promise<boolean> => {
    const level = await KnowledgeBaseAccessGrantModel.resolveAccessLevelForFile(db, fileId, userId);
    if (!level) return false;
    if (level === 'owner') return true;
    return knowledgeBaseGrantAccessAtLeast(level, required);
  };

  static canPerformOnDocument = async (
    db: LobeChatDatabase,
    documentId: string,
    userId: string,
    required: KnowledgeBaseGrantAccessLevel,
  ): Promise<boolean> => {
    const level = await KnowledgeBaseAccessGrantModel.resolveAccessLevelForDocument(
      db,
      documentId,
      userId,
    );
    if (!level) return false;
    if (level === 'owner') return true;
    return knowledgeBaseGrantAccessAtLeast(level, required);
  };

  /**
   * Owner or a personal-share `full` grantee may manage collaborators / invites.
   * Content grades below `full` stay content-only.
   */
  private assertPersonalShareAdmin = async (knowledgeBaseId: string) => {
    const [kb] = await this.db
      .select({
        id: knowledgeBases.id,
        userId: knowledgeBases.userId,
        workspaceId: knowledgeBases.workspaceId,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, knowledgeBaseId),
          notTrashed(knowledgeBases.isDeleted),
          isUserKnowledgeBase(),
        ),
      )
      .limit(1);

    if (!kb) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Knowledge base not found' });
    }
    if (kb.workspaceId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Personal sharing only applies to personal knowledge bases',
      });
    }
    if (kb.userId === this.userId) return kb;

    const canAdmin = await KnowledgeBaseAccessGrantModel.canPerform(
      this.db,
      knowledgeBaseId,
      this.userId,
      'full',
    );
    if (!canAdmin) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You need full access to manage sharing for this knowledge base',
      });
    }
    return kb;
  };

  listGrants = async (knowledgeBaseId: string) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    const rows = await this.db
      .select({
        // Raw SQL keeps this query working when Turbopack briefly serves a
        // schema module that predates the `access_level` column.
        accessLevel: sql<string>`"knowledge_base_access_grants"."access_level"`,
        avatar: users.avatar,
        createdAt: knowledgeBaseAccessGrants.createdAt,
        email: users.email,
        fullName: users.fullName,
        id: knowledgeBaseAccessGrants.id,
        knowledgeBaseId: knowledgeBaseAccessGrants.knowledgeBaseId,
        subjectType: knowledgeBaseAccessGrants.subjectType,
        userId: knowledgeBaseAccessGrants.userId,
        username: users.username,
      })
      .from(knowledgeBaseAccessGrants)
      .leftJoin(users, eq(users.id, knowledgeBaseAccessGrants.userId))
      .where(eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId));

    const allGrant = rows.find((row) => row.subjectType === 'all');
    const collaborators = rows
      .filter((row) => row.subjectType === 'user' && row.userId)
      .map((row) => ({
        accessLevel: asAccessLevel(row.accessLevel),
        avatar: row.avatar,
        createdAt: row.createdAt,
        email: row.email,
        fullName: row.fullName,
        grantId: row.id,
        id: row.userId!,
        username: row.username,
      }));

    return {
      collaborators,
      shareWithAll: Boolean(allGrant),
      shareWithAllAccessLevel: allGrant
        ? asAccessLevel(allGrant.accessLevel)
        : DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL,
    };
  };

  addUsers = async (
    knowledgeBaseId: string,
    userIds: string[],
    accessLevel: KnowledgeBaseGrantAccessLevel = DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL,
  ) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    const uniqueIds = [...new Set(userIds)].filter((id) => id && id !== this.userId);
    if (uniqueIds.length === 0) return { added: 0 };

    const existingUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, uniqueIds));
    const validIds = existingUsers.map((row) => row.id);
    if (validIds.length === 0) return { added: 0 };

    const existingGrants = await this.db
      .select({ userId: knowledgeBaseAccessGrants.userId })
      .from(knowledgeBaseAccessGrants)
      .where(
        and(
          eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBaseAccessGrants.subjectType, 'user'),
          inArray(knowledgeBaseAccessGrants.userId, validIds),
        ),
      );
    const existingSet = new Set(
      existingGrants.map((row) => row.userId).filter((id): id is string => Boolean(id)),
    );
    const toInsert = validIds.filter((id) => !existingSet.has(id));
    const toUpdate = validIds.filter((id) => existingSet.has(id));

    if (toUpdate.length > 0) {
      await this.db
        .update(knowledgeBaseAccessGrants)
        .set({ accessLevel, updatedAt: new Date() })
        .where(
          and(
            eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
            eq(knowledgeBaseAccessGrants.subjectType, 'user'),
            inArray(knowledgeBaseAccessGrants.userId, toUpdate),
          ),
        );
    }

    if (toInsert.length === 0) return { added: toUpdate.length > 0 ? toUpdate.length : 0 };

    const inserted = await this.db
      .insert(knowledgeBaseAccessGrants)
      .values(
        toInsert.map((userId) => ({
          accessLevel,
          createdBy: this.userId,
          knowledgeBaseId,
          subjectType: 'user' as const,
          userId,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: knowledgeBaseAccessGrants.id });

    return { added: inserted.length + toUpdate.length };
  };

  updateUserAccessLevel = async (
    knowledgeBaseId: string,
    targetUserId: string,
    accessLevel: KnowledgeBaseGrantAccessLevel,
  ) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    const updated = await this.db
      .update(knowledgeBaseAccessGrants)
      .set({ accessLevel, updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBaseAccessGrants.subjectType, 'user'),
          eq(knowledgeBaseAccessGrants.userId, targetUserId),
        ),
      )
      .returning({ id: knowledgeBaseAccessGrants.id });

    if (updated.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Share grant not found' });
    }

    return { accessLevel, success: true as const };
  };

  removeUser = async (knowledgeBaseId: string, targetUserId: string) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    await this.db
      .delete(knowledgeBaseAccessGrants)
      .where(
        and(
          eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBaseAccessGrants.subjectType, 'user'),
          eq(knowledgeBaseAccessGrants.userId, targetUserId),
        ),
      );

    return { success: true as const };
  };

  setShareWithAll = async (
    knowledgeBaseId: string,
    enabled: boolean,
    accessLevel: KnowledgeBaseGrantAccessLevel = DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL,
  ) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    if (enabled) {
      const existing = await this.db
        .select({ id: knowledgeBaseAccessGrants.id })
        .from(knowledgeBaseAccessGrants)
        .where(
          and(
            eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
            eq(knowledgeBaseAccessGrants.subjectType, 'all'),
            isNull(knowledgeBaseAccessGrants.userId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await this.db
          .update(knowledgeBaseAccessGrants)
          .set({ accessLevel, updatedAt: new Date() })
          .where(eq(knowledgeBaseAccessGrants.id, existing[0].id));
      } else {
        await this.db.insert(knowledgeBaseAccessGrants).values({
          accessLevel,
          createdBy: this.userId,
          knowledgeBaseId,
          subjectType: 'all',
          userId: null,
        });
      }
    } else {
      await this.db
        .delete(knowledgeBaseAccessGrants)
        .where(
          and(
            eq(knowledgeBaseAccessGrants.knowledgeBaseId, knowledgeBaseId),
            eq(knowledgeBaseAccessGrants.subjectType, 'all'),
            isNull(knowledgeBaseAccessGrants.userId),
          ),
        );
    }

    return {
      shareWithAll: enabled,
      shareWithAllAccessLevel: enabled ? accessLevel : DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL,
    };
  };

  getOrCreateInvite = async (knowledgeBaseId: string) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    const [existing] = await this.db
      .select()
      .from(knowledgeBaseShareInvites)
      .where(eq(knowledgeBaseShareInvites.knowledgeBaseId, knowledgeBaseId))
      .limit(1);

    if (existing) {
      if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
        return this.rotateInvite(knowledgeBaseId);
      }
      return existing;
    }

    const [created] = await this.db
      .insert(knowledgeBaseShareInvites)
      .values({
        createdBy: this.userId,
        id: createNanoId(16)(),
        knowledgeBaseId,
        token: createNanoId(24)(),
      })
      .returning();

    return created;
  };

  rotateInvite = async (knowledgeBaseId: string) => {
    await this.assertPersonalShareAdmin(knowledgeBaseId);

    await this.db
      .delete(knowledgeBaseShareInvites)
      .where(eq(knowledgeBaseShareInvites.knowledgeBaseId, knowledgeBaseId));

    const [created] = await this.db
      .insert(knowledgeBaseShareInvites)
      .values({
        createdBy: this.userId,
        id: createNanoId(16)(),
        knowledgeBaseId,
        token: createNanoId(24)(),
      })
      .returning();

    return created;
  };

  /**
   * Accept a reusable invite link: upserts a user grant for the caller.
   * Owners accepting their own link is a no-op success.
   */
  acceptInvite = async (token: string) => {
    const [invite] = await this.db
      .select()
      .from(knowledgeBaseShareInvites)
      .where(eq(knowledgeBaseShareInvites.token, token))
      .limit(1);

    if (!invite) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite has expired' });
    }

    const [kb] = await this.db
      .select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        userId: knowledgeBases.userId,
        workspaceId: knowledgeBases.workspaceId,
      })
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, invite.knowledgeBaseId),
          notTrashed(knowledgeBases.isDeleted),
          isUserKnowledgeBase(),
        ),
      )
      .limit(1);

    if (!kb || kb.workspaceId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Knowledge base not found' });
    }

    if (kb.userId === this.userId) {
      return { knowledgeBaseId: kb.id, name: kb.name, alreadyOwner: true as const };
    }

    await this.db
      .insert(knowledgeBaseAccessGrants)
      .values({
        accessLevel: DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL,
        createdBy: invite.createdBy,
        knowledgeBaseId: kb.id,
        subjectType: 'user',
        userId: this.userId,
      })
      .onConflictDoNothing();

    return { knowledgeBaseId: kb.id, name: kb.name, alreadyOwner: false as const };
  };

  /**
   * Narrow user lookup for the share picker: exact email (case-insensitive)
   * or username prefix. Never returns the caller; capped result set.
   */
  searchShareableUsers = async (query: string) => {
    const q = query.trim();
    if (q.length < 2) return [];

    const looksLikeEmail = q.includes('@');
    const rows = await this.db
      .select({
        avatar: users.avatar,
        email: users.email,
        fullName: users.fullName,
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(
        and(
          ne(users.id, this.userId),
          looksLikeEmail
            ? sql`lower(${users.email}) = lower(${q})`
            : or(ilike(users.username, `${q}%`), ilike(users.fullName, `${q}%`)),
        ),
      )
      .limit(SHAREABLE_USER_LIMIT);

    return rows;
  };
}
