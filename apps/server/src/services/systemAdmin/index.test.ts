// @vitest-environment node
import { RBAC_PERMISSIONS, SYSTEM_DEFAULT_ROLES } from '@lobechat/const/rbac';
import type { LobeChatDatabase } from '@lobechat/database';
import { getTestDB } from '@lobechat/database/test-utils';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RbacModel } from '@/database/models/rbac';
import { roles, userRoles, users } from '@/database/schemas';

import { SystemAdminService } from './index';

const db: LobeChatDatabase = await getTestDB();

const firstUserId = 'system-admin-first';
const secondUserId = 'system-admin-second';

const cleanup = async () => {
  await db.delete(userRoles);
  await db.delete(users);
  // Keep shared permission/role rows that other suites may rely on; only drop
  // the bootstrap role assignment rows via userRoles above. Role itself can
  // remain — ensureSuperAdminRole is idempotent.
};

beforeEach(async () => {
  await cleanup();
});

afterEach(cleanup);

describe('SystemAdminService', () => {
  it('promotes the first user when no super_admin exists', async () => {
    await db.insert(users).values({
      email: 'admin@example.com',
      id: firstUserId,
    });

    const service = new SystemAdminService(db);
    const promoted = await service.promoteBootstrapAdminIfNeeded(firstUserId);

    expect(promoted).toBe(true);
    expect(await service.isSuperAdmin(firstUserId)).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, firstUserId));
    expect(row.role).toBe('admin');

    const rbac = new RbacModel(db, firstUserId);
    expect(await rbac.hasPermission(RBAC_PERMISSIONS.USER_READ_ALL)).toBe(true);
    expect(await rbac.hasPermission(RBAC_PERMISSIONS.USER_UPDATE_ALL)).toBe(true);
  });

  it('does not promote a second user when a super_admin already exists', async () => {
    await db.insert(users).values([
      { email: 'admin@example.com', id: firstUserId },
      { email: 'member@example.com', id: secondUserId },
    ]);

    const service = new SystemAdminService(db);
    await service.promoteBootstrapAdminIfNeeded(firstUserId);
    const promotedAgain = await service.promoteBootstrapAdminIfNeeded(secondUserId);

    expect(promotedAgain).toBe(false);
    expect(await service.isSuperAdmin(secondUserId)).toBe(false);
  });

  it('refuses to revoke the last super_admin', async () => {
    await db.insert(users).values({ email: 'admin@example.com', id: firstUserId });
    const service = new SystemAdminService(db);
    await service.grantSuperAdmin(firstUserId);

    await expect(service.revokeSuperAdmin(firstUserId)).rejects.toThrow('LAST_SUPER_ADMIN');
    expect(await service.isSuperAdmin(firstUserId)).toBe(true);
  });

  it('can grant and revoke when another super_admin remains', async () => {
    await db.insert(users).values([
      { email: 'admin@example.com', id: firstUserId },
      { email: 'admin2@example.com', id: secondUserId },
    ]);

    const service = new SystemAdminService(db);
    await service.grantSuperAdmin(firstUserId);
    await service.grantSuperAdmin(secondUserId);
    await service.revokeSuperAdmin(secondUserId);

    expect(await service.isSuperAdmin(firstUserId)).toBe(true);
    expect(await service.isSuperAdmin(secondUserId)).toBe(false);

    const role = await db.query.roles.findFirst({
      where: and(eq(roles.name, SYSTEM_DEFAULT_ROLES.SUPER_ADMIN), isNull(roles.workspaceId)),
    });
    expect(role).toBeTruthy();
  });

  it('reports needsAdminSetup only when the users table is empty', async () => {
    expect(await SystemAdminService.needsAdminSetup(db)).toBe(true);

    await db.insert(users).values({ email: 'admin@example.com', id: firstUserId });
    expect(await SystemAdminService.needsAdminSetup(db)).toBe(false);
  });

  it('treats the earliest super_admin assignment as the bootstrap admin', async () => {
    await db.insert(users).values([
      { email: 'admin@example.com', id: firstUserId },
      { email: 'admin2@example.com', id: secondUserId },
    ]);

    const service = new SystemAdminService(db);
    await service.grantSuperAdmin(firstUserId);
    await service.grantSuperAdmin(secondUserId);

    expect(await service.getBootstrapAdminUserId()).toBe(firstUserId);
    expect(await service.isBootstrapAdmin(firstUserId)).toBe(true);
    expect(await service.isBootstrapAdmin(secondUserId)).toBe(false);
  });
});
