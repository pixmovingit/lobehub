import { RBAC_PERMISSIONS, ROLE_DESCRIPTIONS, SYSTEM_DEFAULT_ROLES } from '@lobechat/const/rbac';
import type { LobeChatDatabase } from '@lobechat/database';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import { permissions, rolePermissions, roles, userRoles } from '@/database/schemas/rbac';
import { users } from '@/database/schemas/user';

type DbClient = LobeChatDatabase;

/** Stable Postgres advisory lock key for bootstrap / role seeding. */
const SYSTEM_ADMIN_LOCK_KEY = 8_042_011;

/**
 * Permission codes the global `super_admin` role must hold for system user
 * administration. Kept narrow (user + rbac user-role) so bootstrap does not
 * need every resource permission row to exist in the DB.
 */
export const SUPER_ADMIN_REQUIRED_PERMISSIONS = [
  {
    category: 'user',
    code: RBAC_PERMISSIONS.USER_READ_ALL,
    name: 'User Read All',
  },
  {
    category: 'user',
    code: RBAC_PERMISSIONS.USER_CREATE_ALL,
    name: 'User Create All',
  },
  {
    category: 'user',
    code: RBAC_PERMISSIONS.USER_UPDATE_ALL,
    name: 'User Update All',
  },
  {
    category: 'user',
    code: RBAC_PERMISSIONS.USER_DELETE_ALL,
    name: 'User Delete All',
  },
  {
    category: 'rbac',
    code: RBAC_PERMISSIONS.RBAC_USER_ROLE_READ_ALL,
    name: 'RBAC User Role Read',
  },
  {
    category: 'rbac',
    code: RBAC_PERMISSIONS.RBAC_USER_ROLE_UPDATE_ALL,
    name: 'RBAC User Role Update',
  },
  {
    category: 'rbac',
    code: RBAC_PERMISSIONS.RBAC_USER_ROLE_DELETE_ALL,
    name: 'RBAC User Role Delete',
  },
] as const;

export class SystemAdminService {
  constructor(private readonly db: LobeChatDatabase) {}

  static countUsers = async (db: LobeChatDatabase): Promise<number> => {
    const [row] = await db.select({ value: count() }).from(users);
    return Number(row?.value ?? 0);
  };

  static needsAdminSetup = async (db: LobeChatDatabase): Promise<boolean> => {
    return (await SystemAdminService.countUsers(db)) === 0;
  };

  /**
   * After a new account is created: if the deployment has no global
   * `super_admin` yet, promote this user. Self-host bootstrap only — Cloud
   * (`ENABLE_BUSINESS_FEATURES`) skips this path at the call site.
   */
  promoteBootstrapAdminIfNeeded = async (userId: string): Promise<boolean> => {
    return this.db.transaction(async (tx) => {
      const db = tx as DbClient;
      await db.execute(sql`SELECT pg_advisory_xact_lock(${SYSTEM_ADMIN_LOCK_KEY})`);

      if (await this.hasAnySuperAdmin(db)) return false;

      await this.ensureSuperAdminRole(db);
      await this.assignSuperAdmin(db, userId);
      return true;
    });
  };

  grantSuperAdmin = async (userId: string): Promise<void> => {
    await this.db.transaction(async (tx) => {
      const db = tx as DbClient;
      await db.execute(sql`SELECT pg_advisory_xact_lock(${SYSTEM_ADMIN_LOCK_KEY})`);
      await this.ensureSuperAdminRole(db);
      await this.assignSuperAdmin(db, userId);
    });
  };

  /**
   * Revoke global super_admin. Refuses when this would leave the deployment
   * with zero super admins.
   */
  revokeSuperAdmin = async (userId: string): Promise<void> => {
    await this.db.transaction(async (tx) => {
      const db = tx as DbClient;
      await db.execute(sql`SELECT pg_advisory_xact_lock(${SYSTEM_ADMIN_LOCK_KEY})`);

      const role = await this.findSuperAdminRole(db);
      if (!role) return;

      const admins = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(and(eq(userRoles.roleId, role.id), isNull(userRoles.workspaceId)));

      if (admins.length <= 1 && admins.some((row) => row.userId === userId)) {
        throw new Error('LAST_SUPER_ADMIN');
      }

      await db
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, role.id),
            isNull(userRoles.workspaceId),
          ),
        );

      await db.update(users).set({ role: null }).where(eq(users.id, userId));
    });
  };

  isSuperAdmin = async (userId: string): Promise<boolean> => {
    const role = await this.findSuperAdminRole(this.db);
    if (!role) return false;

    const [row] = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, role.id),
          isNull(userRoles.workspaceId),
        ),
      )
      .limit(1);

    return Boolean(row);
  };

  listSuperAdminUserIds = async (): Promise<string[]> => {
    const role = await this.findSuperAdminRole(this.db);
    if (!role) return [];

    const rows = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.roleId, role.id), isNull(userRoles.workspaceId)));

    return rows.map((row) => row.userId);
  };

  /**
   * The bootstrap / initial system admin is the earliest global `super_admin`
   * assignment. Later grants stay ordinary system admins.
   */
  getBootstrapAdminUserId = async (): Promise<string | null> => {
    const role = await this.findSuperAdminRole(this.db);
    if (!role) return null;

    const [row] = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.roleId, role.id), isNull(userRoles.workspaceId)))
      .orderBy(userRoles.createdAt, userRoles.userId)
      .limit(1);

    return row?.userId ?? null;
  };

  isBootstrapAdmin = async (userId: string): Promise<boolean> => {
    const bootstrapAdminUserId = await this.getBootstrapAdminUserId();
    return bootstrapAdminUserId === userId;
  };

  private hasAnySuperAdmin = async (tx: DbClient): Promise<boolean> => {
    const role = await this.findSuperAdminRole(tx);
    if (!role) return false;

    const [row] = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.roleId, role.id), isNull(userRoles.workspaceId)))
      .limit(1);

    return Boolean(row);
  };

  private findSuperAdminRole = async (tx: DbClient): Promise<{ id: string } | undefined> => {
    const role = await tx.query.roles.findFirst({
      columns: { id: true },
      where: and(eq(roles.name, SYSTEM_DEFAULT_ROLES.SUPER_ADMIN), isNull(roles.workspaceId)),
    });
    return role;
  };

  /**
   * Idempotently create the global `super_admin` role and attach the required
   * user-administration permission codes.
   */
  ensureSuperAdminRole = async (tx: DbClient = this.db): Promise<string> => {
    const existing = await this.findSuperAdminRole(tx);
    let roleId = existing?.id;

    if (!roleId) {
      const [created] = await tx
        .insert(roles)
        .values({
          description: ROLE_DESCRIPTIONS[SYSTEM_DEFAULT_ROLES.SUPER_ADMIN],
          displayName: 'Super Admin',
          isActive: true,
          isSystem: true,
          name: SYSTEM_DEFAULT_ROLES.SUPER_ADMIN,
          workspaceId: null,
        })
        .onConflictDoNothing()
        .returning({ id: roles.id });

      if (created) {
        roleId = created.id;
      } else {
        const again = await this.findSuperAdminRole(tx);
        if (!again) throw new Error('Failed to ensure super_admin role');
        roleId = again.id;
      }
    } else {
      await tx.update(roles).set({ isActive: true, isSystem: true }).where(eq(roles.id, roleId));
    }

    const permissionIds: string[] = [];

    for (const permission of SUPER_ADMIN_REQUIRED_PERMISSIONS) {
      const [inserted] = await tx
        .insert(permissions)
        .values({
          category: permission.category,
          code: permission.code,
          isActive: true,
          name: permission.name,
        })
        .onConflictDoNothing()
        .returning({ id: permissions.id });

      if (inserted) {
        permissionIds.push(inserted.id);
        continue;
      }

      const found = await tx.query.permissions.findFirst({
        columns: { id: true },
        where: eq(permissions.code, permission.code),
      });
      if (found) permissionIds.push(found.id);
    }

    if (permissionIds.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(permissionIds.map((permissionId) => ({ permissionId, roleId: roleId! })))
        .onConflictDoNothing();
    }

    return roleId;
  };

  private assignSuperAdmin = async (tx: DbClient, userId: string) => {
    const roleId = await this.ensureSuperAdminRole(tx);

    await tx
      .insert(userRoles)
      .values({
        roleId,
        userId,
        workspaceId: null,
      })
      .onConflictDoNothing();

    await tx.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
  };
}

export type AdminListedUser = {
  avatar: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
  email: string | null;
  fullName: string | null;
  id: string;
  isBootstrapAdmin: boolean;
  isSuperAdmin: boolean;
  lastActiveAt: Date;
  username: string | null;
};

export const listUsersForAdmin = async (
  db: LobeChatDatabase,
  options: { limit?: number; offset?: number; query?: string } = {},
): Promise<{ bootstrapAdminUserId: string | null; items: AdminListedUser[]; total: number }> => {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const query = options.query?.trim();

  const where = query
    ? sql`(${users.email} ILIKE ${`%${query}%`} OR ${users.username} ILIKE ${`%${query}%`} OR ${users.fullName} ILIKE ${`%${query}%`})`
    : undefined;

  const [totalRow] = await db.select({ value: count() }).from(users).where(where);
  const rows = await db
    .select({
      avatar: users.avatar,
      banned: users.banned,
      banReason: users.banReason,
      createdAt: users.createdAt,
      email: users.email,
      fullName: users.fullName,
      id: users.id,
      lastActiveAt: users.lastActiveAt,
      username: users.username,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const adminService = new SystemAdminService(db);
  const [superAdminIdsList, bootstrapAdminUserId] = await Promise.all([
    adminService.listSuperAdminUserIds(),
    adminService.getBootstrapAdminUserId(),
  ]);
  const superAdminIds = new Set(superAdminIdsList);

  return {
    bootstrapAdminUserId,
    items: rows.map((row) => ({
      ...row,
      isBootstrapAdmin: bootstrapAdminUserId === row.id,
      isSuperAdmin: superAdminIds.has(row.id),
    })),
    total: Number(totalRow?.value ?? 0),
  };
};