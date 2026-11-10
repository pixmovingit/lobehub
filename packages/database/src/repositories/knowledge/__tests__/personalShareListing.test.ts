// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import { KnowledgeBaseModel } from '../../../models/knowledgeBase';
import { KnowledgeBaseAccessGrantModel } from '../../../models/knowledgeBaseAccessGrant';
import { documents, files, knowledgeBaseFiles } from '../../../schemas/file';
import { users } from '../../../schemas/user';
import type { LobeChatDatabase } from '../../../type';
import { KnowledgeRepo } from '../index';

const serverDB: LobeChatDatabase = await getTestDB();

const ownerId = 'kb-list-owner';
const granteeId = 'kb-list-grantee';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([
    { id: ownerId, username: 'owner' },
    { id: granteeId, username: 'grantee' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('KnowledgeRepo.query — personal share browse', () => {
  it('lets a grantee list creator-owned files inside a shared knowledge base', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Shared KB' });
    await serverDB.insert(files).values([
      {
        fileType: 'application/pdf',
        id: 'owner-file',
        name: 'owner.pdf',
        size: 10,
        url: 'owner-file-url',
        userId: ownerId,
      },
    ]);
    await serverDB
      .insert(knowledgeBaseFiles)
      .values([{ fileId: 'owner-file', knowledgeBaseId: kb.id, userId: ownerId }]);
    await serverDB.insert(documents).values([
      {
        content: 'note',
        fileType: 'custom/document',
        filename: 'note',
        id: 'owner-note',
        knowledgeBaseId: kb.id,
        source: 'document',
        sourceType: 'api',
        title: 'Owner note',
        totalCharCount: 4,
        totalLineCount: 1,
        userId: ownerId,
      },
    ]);

    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).addUsers(kb.id, [granteeId]);

    const asOwner = await new KnowledgeRepo(serverDB, ownerId).query({
      knowledgeBaseId: kb.id,
      parentId: null,
    });
    expect(asOwner.map((item) => item.id).sort()).toEqual(['owner-file', 'owner-note']);

    const asGrantee = await new KnowledgeRepo(serverDB, granteeId).query({
      knowledgeBaseId: kb.id,
      parentId: null,
    });
    expect(asGrantee.map((item) => item.id).sort()).toEqual(['owner-file', 'owner-note']);
  });

  it('keeps unshared libraries empty for strangers', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Private KB' });
    await serverDB.insert(files).values([
      {
        fileType: 'text/plain',
        id: 'secret-file',
        name: 'secret.txt',
        size: 1,
        url: 'secret-url',
        userId: ownerId,
      },
    ]);
    await serverDB
      .insert(knowledgeBaseFiles)
      .values([{ fileId: 'secret-file', knowledgeBaseId: kb.id, userId: ownerId }]);

    const asStranger = await new KnowledgeRepo(serverDB, granteeId).query({
      knowledgeBaseId: kb.id,
      parentId: null,
    });
    expect(asStranger).toEqual([]);
  });

  it('lets the owner and other grantees see collaborator uploads', async () => {
    const kb = await new KnowledgeBaseModel(serverDB, ownerId).create({ name: 'Shared KB' });
    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).addUsers(kb.id, [granteeId], 'edit');

    await serverDB.insert(files).values([
      {
        fileType: 'text/plain',
        id: 'grantee-upload',
        name: 'from-grantee.txt',
        size: 2,
        url: 'grantee-upload-url',
        userId: granteeId,
      },
    ]);
    await serverDB
      .insert(knowledgeBaseFiles)
      .values([{ fileId: 'grantee-upload', knowledgeBaseId: kb.id, userId: granteeId }]);
    await serverDB.insert(documents).values([
      {
        content: 'collab note',
        fileType: 'custom/document',
        filename: 'collab',
        id: 'grantee-note',
        knowledgeBaseId: kb.id,
        source: 'document',
        sourceType: 'api',
        title: 'Grantee note',
        totalCharCount: 11,
        totalLineCount: 1,
        userId: granteeId,
      },
    ]);

    const asOwner = await new KnowledgeRepo(serverDB, ownerId).query({
      knowledgeBaseId: kb.id,
      parentId: null,
    });
    expect(asOwner.map((item) => item.id).sort()).toEqual(['grantee-note', 'grantee-upload']);

    const asGrantee = await new KnowledgeRepo(serverDB, granteeId).query({
      knowledgeBaseId: kb.id,
      parentId: null,
    });
    expect(asGrantee.map((item) => item.id).sort()).toEqual(['grantee-note', 'grantee-upload']);
  });
});
