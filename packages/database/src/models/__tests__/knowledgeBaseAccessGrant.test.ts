// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { documents, files, knowledgeBaseFiles, users } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { KnowledgeBaseModel } from '../knowledgeBase';
import { KnowledgeBaseAccessGrantModel } from '../knowledgeBaseAccessGrant';

const serverDB: LobeChatDatabase = await getTestDB();

const ownerId = 'kb-share-owner';
const granteeId = 'kb-share-grantee';
const strangerId = 'kb-share-stranger';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([
    { email: 'owner@example.com', id: ownerId, username: 'owner' },
    { email: 'grantee@example.com', id: granteeId, username: 'grantee' },
    { email: 'stranger@example.com', id: strangerId, username: 'stranger' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

const createPersonalKb = async (userId: string, name = 'Shared library') => {
  const model = new KnowledgeBaseModel(serverDB, userId);
  return model.create({ name });
};

describe('KnowledgeBaseAccessGrantModel', () => {
  it('lets the owner grant a user and list collaborators', async () => {
    const kb = await createPersonalKb(ownerId);
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);

    await grants.addUsers(kb.id, [granteeId]);
    const listed = await grants.listGrants(kb.id);

    expect(listed.shareWithAll).toBe(false);
    expect(listed.collaborators.map((c) => c.id)).toEqual([granteeId]);
    expect(listed.collaborators[0]?.accessLevel).toBe('view');
  });

  it('stores and enforces cumulative access levels', async () => {
    const kb = await createPersonalKb(ownerId);
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);

    await grants.addUsers(kb.id, [granteeId], 'edit');
    expect(await KnowledgeBaseAccessGrantModel.resolveAccessLevel(serverDB, kb.id, granteeId)).toBe(
      'edit',
    );
    expect(await KnowledgeBaseAccessGrantModel.canPerform(serverDB, kb.id, granteeId, 'edit')).toBe(
      true,
    );
    expect(
      await KnowledgeBaseAccessGrantModel.canPerform(serverDB, kb.id, granteeId, 'delete'),
    ).toBe(false);

    await grants.updateUserAccessLevel(kb.id, granteeId, 'delete');
    expect(
      await KnowledgeBaseAccessGrantModel.canPerform(serverDB, kb.id, granteeId, 'delete'),
    ).toBe(true);
    expect(await KnowledgeBaseAccessGrantModel.canPerform(serverDB, kb.id, granteeId, 'full')).toBe(
      false,
    );

    await grants.updateUserAccessLevel(kb.id, granteeId, 'full');
    expect(await KnowledgeBaseAccessGrantModel.canPerform(serverDB, kb.id, granteeId, 'full')).toBe(
      true,
    );

    await grants.setShareWithAll(kb.id, true, 'view');
    expect(
      await KnowledgeBaseAccessGrantModel.resolveAccessLevel(serverDB, kb.id, strangerId),
    ).toBe('view');
    // User grant outranks the all-users view grant for the same library.
    expect(await KnowledgeBaseAccessGrantModel.resolveAccessLevel(serverDB, kb.id, granteeId)).toBe(
      'full',
    );
  });

  it('refuses non-full grantees managing grants', async () => {
    const kb = await createPersonalKb(ownerId);
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, granteeId);

    await expect(grants.addUsers(kb.id, [strangerId])).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('reports whether any share grant exists on a library', async () => {
    const kb = await createPersonalKb(ownerId);
    const other = await createPersonalKb(ownerId);
    expect(await KnowledgeBaseAccessGrantModel.hasAnyGrant(serverDB, kb.id)).toBe(false);

    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).addUsers(kb.id, [granteeId]);
    expect(await KnowledgeBaseAccessGrantModel.hasAnyGrant(serverDB, kb.id)).toBe(true);
    expect(
      await KnowledgeBaseAccessGrantModel.knowledgeBaseIdsWithGrants(serverDB, [kb.id, other.id]),
    ).toEqual(new Set([kb.id]));
  });

  it('lets a full-access grantee manage sharing like the owner', async () => {
    const kb = await createPersonalKb(ownerId);
    await new KnowledgeBaseAccessGrantModel(serverDB, ownerId).addUsers(kb.id, [granteeId], 'full');

    const asFull = new KnowledgeBaseAccessGrantModel(serverDB, granteeId);
    await asFull.addUsers(kb.id, [strangerId], 'view');
    const listed = await asFull.listGrants(kb.id);

    expect(listed.collaborators.map((c) => c.id).sort()).toEqual([granteeId, strangerId].sort());
    expect(listed.collaborators.find((c) => c.id === strangerId)?.accessLevel).toBe('view');

    await asFull.updateUserAccessLevel(kb.id, strangerId, 'edit');
    expect(
      await KnowledgeBaseAccessGrantModel.resolveAccessLevel(serverDB, kb.id, strangerId),
    ).toBe('edit');
  });

  it('shares with all registered users and resolves access', async () => {
    const kb = await createPersonalKb(ownerId);
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);

    await grants.setShareWithAll(kb.id, true);

    expect(await KnowledgeBaseAccessGrantModel.resolveAccess(serverDB, kb.id, strangerId)).toBe(
      'public',
    );
    expect(await KnowledgeBaseAccessGrantModel.canBrowse(serverDB, kb.id, strangerId)).toBe(true);

    await grants.setShareWithAll(kb.id, false);
    expect(await KnowledgeBaseAccessGrantModel.canBrowse(serverDB, kb.id, strangerId)).toBe(false);
  });

  it('accepts an invite token into a user grant', async () => {
    const kb = await createPersonalKb(ownerId);
    const ownerGrants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
    const invite = await ownerGrants.getOrCreateInvite(kb.id);

    const granteeGrants = new KnowledgeBaseAccessGrantModel(serverDB, granteeId);
    const accepted = await granteeGrants.acceptInvite(invite.token);

    expect(accepted.knowledgeBaseId).toBe(kb.id);
    expect(await KnowledgeBaseAccessGrantModel.resolveAccess(serverDB, kb.id, granteeId)).toBe(
      'userGrant',
    );
  });

  it('surfaces granted libraries in personal KnowledgeBaseModel.query', async () => {
    const kb = await createPersonalKb(ownerId, 'Visible to grantee');
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
    await grants.addUsers(kb.id, [granteeId]);

    const granteeModel = new KnowledgeBaseModel(serverDB, granteeId);
    const list = await granteeModel.query();

    expect(list.map((item) => item.id)).toContain(kb.id);
    expect(list.find((item) => item.id === kb.id)?.accessType).toBe('userGrant');
    expect(list.find((item) => item.id === kb.id)?.accessLevel).toBe('view');

    const accessible = await granteeModel.findAccessibleById(kb.id);
    expect(accessible?.id).toBe(kb.id);

    const ownedOnly = await granteeModel.findById(kb.id);
    expect(ownedOnly).toBeUndefined();
  });

  it('searches shareable users by email without returning the caller', async () => {
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
    const byEmail = await grants.searchShareableUsers('grantee@example.com');
    expect(byEmail.map((u) => u.id)).toEqual([granteeId]);

    const self = await grants.searchShareableUsers('owner@example.com');
    expect(self).toEqual([]);
  });

  it('removes a user grant so the library disappears from their list', async () => {
    const kb = await createPersonalKb(ownerId);
    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
    await grants.addUsers(kb.id, [granteeId]);
    await grants.removeUser(kb.id, granteeId);

    expect(await KnowledgeBaseAccessGrantModel.canBrowse(serverDB, kb.id, granteeId)).toBe(false);
    const list = await new KnowledgeBaseModel(serverDB, granteeId).query();
    expect(list.map((item) => item.id)).not.toContain(kb.id);
  });

  it('resolves content-level access for files and documents in a granted library', async () => {
    const kb = await createPersonalKb(ownerId);

    await serverDB.insert(files).values([
      {
        fileType: 'text/plain',
        id: 'grant-file',
        name: 'a.txt',
        size: 1,
        url: 'grant-file-url',
        userId: ownerId,
      },
    ]);
    await serverDB
      .insert(knowledgeBaseFiles)
      .values([{ fileId: 'grant-file', knowledgeBaseId: kb.id, userId: ownerId }]);
    await serverDB.insert(documents).values([
      {
        content: 'x',
        fileType: 'custom/document',
        filename: 'doc',
        id: 'grant-doc',
        knowledgeBaseId: kb.id,
        source: 'document',
        sourceType: 'api',
        title: 'Doc',
        totalCharCount: 1,
        totalLineCount: 1,
        userId: ownerId,
      },
    ]);

    const grants = new KnowledgeBaseAccessGrantModel(serverDB, ownerId);
    await grants.addUsers(kb.id, [granteeId], 'edit');

    expect(
      await KnowledgeBaseAccessGrantModel.resolveAccessLevelForFile(
        serverDB,
        'grant-file',
        granteeId,
      ),
    ).toBe('edit');
    expect(
      await KnowledgeBaseAccessGrantModel.canPerformOnFile(
        serverDB,
        'grant-file',
        granteeId,
        'edit',
      ),
    ).toBe(true);
    expect(
      await KnowledgeBaseAccessGrantModel.canPerformOnFile(
        serverDB,
        'grant-file',
        granteeId,
        'delete',
      ),
    ).toBe(false);
    expect(
      await KnowledgeBaseAccessGrantModel.resolveAccessLevelForDocument(
        serverDB,
        'grant-doc',
        granteeId,
      ),
    ).toBe('edit');
    expect(
      await KnowledgeBaseAccessGrantModel.resolveAccessLevelForFile(
        serverDB,
        'grant-file',
        ownerId,
      ),
    ).toBe('owner');
  });
});
