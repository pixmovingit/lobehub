// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import { DocumentModel } from '../../../models/document';
import { FileModel } from '../../../models/file';
import { KnowledgeBaseModel } from '../../../models/knowledgeBase';
import { KnowledgeBaseAccessGrantModel } from '../../../models/knowledgeBaseAccessGrant';
import { documents, files, knowledgeBaseFiles } from '../../../schemas/file';
import { users } from '../../../schemas/user';
import type { LobeChatDatabase } from '../../../type';

const serverDB: LobeChatDatabase = await getTestDB();

const ownerId = 'kb-content-owner';
const editorId = 'kb-content-editor';
const viewerId = 'kb-content-viewer';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([
    { id: ownerId, username: 'owner' },
    { id: editorId, username: 'editor' },
    { id: viewerId, username: 'viewer' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

const seedSharedLibrary = async () => {
  const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Shared KB' });
  await serverDB.insert(files).values([
    {
      fileType: 'application/pdf',
      id: 'shared-file',
      name: 'shared.pdf',
      size: 10,
      url: 'shared-file-url',
      userId: ownerId,
    },
  ]);
  await serverDB
    .insert(knowledgeBaseFiles)
    .values([{ fileId: 'shared-file', knowledgeBaseId: kb.id, userId: ownerId }]);
  await serverDB.insert(documents).values([
    {
      content: 'note body',
      fileType: 'custom/document',
      filename: 'note',
      id: 'shared-note',
      knowledgeBaseId: kb.id,
      source: 'document',
      sourceType: 'api',
      title: 'Shared note',
      totalCharCount: 9,
      totalLineCount: 1,
      userId: ownerId,
    },
  ]);

  const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
  await grants.addUsers(kb.id, [editorId], 'edit');
  await grants.addUsers(kb.id, [viewerId], 'view');
  return kb;
};

describe('personal share content co-edit', () => {
  it('lets edit grantees open creator-owned files and notes', async () => {
    await seedSharedLibrary();

    const editorFiles = new FileModel(serverDB, editorId);
    const editorDocs = new DocumentModel(serverDB, editorId);

    expect(await editorFiles.findById('shared-file')).toMatchObject({
      id: 'shared-file',
      name: 'shared.pdf',
    });
    expect(await editorFiles.findKnowledgeBaseIds('shared-file')).toHaveLength(1);
    expect(await editorDocs.findById('shared-note')).toMatchObject({
      id: 'shared-note',
      title: 'Shared note',
    });

    expect(await new FileModel(serverDB, viewerId).findById('shared-file')).toBeDefined();
  });

  it('lets edit grantees update a shared note so both sides see the same content', async () => {
    await seedSharedLibrary();

    const editorDocs = new DocumentModel(serverDB, editorId);
    const updatedAt = await editorDocs.update('shared-note', { content: 'edited together' });
    expect(updatedAt).toBeInstanceOf(Date);

    const ownerDocs = new DocumentModel(serverDB, ownerId);
    expect(await ownerDocs.findById('shared-note')).toMatchObject({
      content: 'edited together',
    });

    const viewerDocs = new DocumentModel(serverDB, viewerId);
    await expect(
      viewerDocs.update('shared-note', { content: 'viewer write' }),
    ).resolves.toBeUndefined();
    expect(await ownerDocs.findById('shared-note')).toMatchObject({
      content: 'edited together',
    });
  });

  it('lets delete grantees remove shared files for everyone', async () => {
    const kb = await seedSharedLibrary();
    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).updateUserAccessLevel(
      kb.id,
      editorId,
      'delete',
    );

    const editorFiles = new FileModel(serverDB, editorId);
    await editorFiles.delete('shared-file', { removeGlobalFile: false });

    expect(await new FileModel(serverDB, ownerId).findById('shared-file')).toBeUndefined();
    expect(await editorFiles.findById('shared-file')).toBeUndefined();
  });

  it('refuses hard-delete for view-only grantees', async () => {
    await seedSharedLibrary();

    const viewerFiles = new FileModel(serverDB, viewerId);
    expect(await viewerFiles.findById('shared-file')).toBeDefined();
    await viewerFiles.delete('shared-file', { removeGlobalFile: false });
    expect(await new FileModel(serverDB, ownerId).findById('shared-file')).toBeDefined();
  });

  it('keeps users without a grant from opening library content', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Private' });
    await serverDB.insert(files).values([
      {
        fileType: 'text/plain',
        id: 'private-file',
        name: 'private.txt',
        size: 1,
        url: 'private-url',
        userId: ownerId,
      },
    ]);
    await serverDB
      .insert(knowledgeBaseFiles)
      .values([{ fileId: 'private-file', knowledgeBaseId: kb.id, userId: ownerId }]);

    expect(await new FileModel(serverDB, viewerId).findById('private-file')).toBeUndefined();
    expect(
      await KnowledgeBaseAccessGrantModel.canPerformOnFile(
        serverDB,
        'private-file',
        viewerId,
        'view',
      ),
    ).toBe(false);
  });
});
