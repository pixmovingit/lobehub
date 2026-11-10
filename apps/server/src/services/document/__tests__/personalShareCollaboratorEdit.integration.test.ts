// @vitest-environment node
import { documents, files, knowledgeBaseFiles, users } from '@lobechat/database/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { DocumentModel } from '@/database/models/document';
import { KnowledgeBaseModel } from '@/database/models/knowledgeBase';
import { KnowledgeBaseAccessGrantModel } from '@/database/models/knowledgeBaseAccessGrant';
import type { LobeChatDatabase } from '@/database/type';

import { DocumentService } from '../index';

const serverDB: LobeChatDatabase = await getTestDB();

const ownerId = 'doc-share-owner';
const editorId = 'doc-share-editor';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([
    { id: ownerId, username: 'owner' },
    { id: editorId, username: 'editor' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

const createValidEditorData = (text: string) => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text,
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
});

describe('personal share collaborator document edit', () => {
  it('persists a grantee editorData save so the owner reads the same content', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Shared KB' });
    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).addUsers(kb.id, [editorId], 'edit');

    const note = await new DocumentModel(serverDB, ownerId).create({
      content: 'original',
      editorData: createValidEditorData('original'),
      fileType: 'custom/document',
      filename: 'note',
      knowledgeBaseId: kb.id,
      source: 'document',
      sourceType: 'api',
      title: 'Shared note',
      totalCharCount: 8,
      totalLineCount: 1,
    });

    const editorService = new DocumentService(serverDB, editorId);
    await editorService.updateDocument(note.id, {
      content: 'edited by collaborator',
      editorData: createValidEditorData('edited by collaborator'),
      saveSource: 'manual',
    });

    const ownerDoc = await new DocumentModel(serverDB, ownerId).findById(note.id);
    expect(ownerDoc?.content).toBe('edited by collaborator');
    expect(ownerDoc?.editorData).toMatchObject(createValidEditorData('edited by collaborator'));

    const editorDoc = await new DocumentModel(serverDB, editorId).findById(note.id);
    expect(editorDoc?.content).toBe('edited by collaborator');
  });

  it('persists a grantee edit of an uploader-owned file-backed library document', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Shared KB' });
    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).addUsers(kb.id, [editorId], 'edit');

    await serverDB.insert(files).values([
      {
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        id: 'shared-docx-file',
        name: 'policy.docx',
        size: 10,
        url: 'docx-url',
        userId: ownerId,
      },
    ]);
    await serverDB.insert(documents).values([
      {
        content: 'docx text',
        editorData: createValidEditorData('docx text'),
        fileId: 'shared-docx-file',
        fileType: 'custom/document',
        filename: 'policy.docx',
        id: 'shared-docx-doc',
        source: 'file',
        sourceType: 'file',
        title: 'policy.docx',
        totalCharCount: 9,
        totalLineCount: 1,
        userId: ownerId,
      },
    ]);
    await serverDB
      .insert(knowledgeBaseFiles)
      .values([{ fileId: 'shared-docx-file', knowledgeBaseId: kb.id, userId: ownerId }]);

    const editorService = new DocumentService(serverDB, editorId);
    await editorService.updateDocument('shared-docx-doc', {
      content: 'compliance update',
      editorData: createValidEditorData('compliance update'),
      saveSource: 'manual',
    });

    expect(await new DocumentModel(serverDB, ownerId).findById('shared-docx-doc')).toMatchObject({
      content: 'compliance update',
    });
  });

  it('blocks a demoted view-only collaborator from editing a document they created', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Shared KB' });
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
    await grants.addUsers(kb.id, [editorId], 'edit');

    const note = await new DocumentModel(serverDB, editorId).create({
      content: 'mine',
      editorData: createValidEditorData('mine'),
      fileType: 'custom/document',
      filename: 'note',
      knowledgeBaseId: kb.id,
      source: 'document',
      sourceType: 'api',
      title: 'Collaborator note',
      totalCharCount: 4,
      totalLineCount: 1,
    });

    await grants.removeUser(kb.id, editorId);
    await grants.setShareWithAll(kb.id, true, 'view');

    const editorService = new DocumentService(serverDB, editorId);
    await expect(
      editorService.updateDocument(note.id, {
        content: 'still editing',
        editorData: createValidEditorData('still editing'),
        saveSource: 'manual',
      }),
    ).rejects.toThrow(/Document not found/i);

    expect(await new DocumentModel(serverDB, ownerId).findById(note.id)).toMatchObject({
      content: 'mine',
    });
  });
});
