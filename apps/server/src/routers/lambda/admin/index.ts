import { RBAC_PERMISSIONS } from '@lobechat/const/rbac';
import type { LobeChatDatabase } from '@lobechat/database';
import type { UserSettings } from '@lobechat/types';
import { UserPreferenceSchema, UserSettingsSchema } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { RbacModel } from '@/database/models/rbac';
import { UserModel } from '@/database/models/user';
import { users } from '@/database/schemas/user';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { listUsersForAdmin, SystemAdminService } from '@/server/services/systemAdmin';

const adminProcedure = authedProcedure.use(serverDatabase).use(async ({ ctx, next }) => {
  const rbac = new RbacModel(ctx.serverDB, ctx.userId);
  const adminService = new SystemAdminService(ctx.serverDB);

  return next({
    ctx: {
      adminService,
      rbac,
    },
  });
});

const requirePermission = async (rbac: RbacModel, code: string): Promise<void> => {
  const allowed = await rbac.hasPermission(code);
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  }
};

const loadTargetUser = async (db: LobeChatDatabase, userId: string) => {
  const row = await db.query.users.findFirst({
    columns: {
      avatar: true,
      banned: true,
      banExpires: true,
      banReason: true,
      createdAt: true,
      email: true,
      fullName: true,
      id: true,
      lastActiveAt: true,
      preference: true,
      role: true,
      username: true,
    },
    where: eq(users.id, userId),
  });

  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  return row;
};

export const adminRouter = router({
  isAdmin: adminProcedure.query(async ({ ctx }) => {
    return ctx.adminService.isSuperAdmin(ctx.userId);
  }),

  listUsers: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).optional(),
          query: z.string().trim().max(200).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.USER_READ_ALL);
      return listUsersForAdmin(ctx.serverDB, input);
    }),

  getUser: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.USER_READ_ALL);

      const user = await loadTargetUser(ctx.serverDB, input.userId);
      const isSuperAdmin = await ctx.adminService.isSuperAdmin(input.userId);

      return { ...user, isSuperAdmin };
    }),

  updateUser: adminProcedure
    .input(
      z
        .object({
          banReason: z.string().trim().max(500).nullable().optional(),
          banned: z.boolean().optional(),
          fullName: z.string().trim().max(64).nullable().optional(),
          userId: z.string().min(1),
          username: z
            .string()
            .trim()
            .max(64)
            .regex(/^[a-zA-Z0-9_]*$/)
            .nullable()
            .optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.USER_UPDATE_ALL);

      const { userId, ...patch } = input;
      await loadTargetUser(ctx.serverDB, userId);

      const next: Partial<typeof users.$inferInsert> = {};
      if ('fullName' in patch) next.fullName = patch.fullName ?? null;
      if ('username' in patch) next.username = patch.username || null;
      if (typeof patch.banned === 'boolean') {
        next.banned = patch.banned;
        next.banReason = patch.banned ? (patch.banReason ?? null) : null;
        if (!patch.banned) next.banExpires = null;
      } else if ('banReason' in patch) {
        next.banReason = patch.banReason ?? null;
      }

      if (Object.keys(next).length === 0) {
        return { success: true };
      }

      await ctx.serverDB.update(users).set(next).where(eq(users.id, userId));
      return { success: true };
    }),

  setSuperAdmin: adminProcedure
    .input(
      z
        .object({
          enabled: z.boolean(),
          userId: z.string().min(1),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.RBAC_USER_ROLE_UPDATE_ALL);
      await loadTargetUser(ctx.serverDB, input.userId);

      try {
        if (input.enabled) {
          await ctx.adminService.grantSuperAdmin(input.userId);
        } else {
          await ctx.adminService.revokeSuperAdmin(input.userId);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'LAST_SUPER_ADMIN') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot revoke the last system administrator.',
          });
        }
        throw error;
      }

      return { success: true };
    }),

  getUserSettings: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.USER_READ_ALL);
      await loadTargetUser(ctx.serverDB, input.userId);

      const model = new UserModel(ctx.serverDB, input.userId);
      const state = await model.getUserState(KeyVaultsGateKeeper.getUserKeyVaults);

      return {
        preference: state.preference,
        settings: state.settings,
      };
    }),

  updateUserSettings: adminProcedure
    .input(
      z
        .object({
          preference: UserPreferenceSchema.optional(),
          settings: UserSettingsSchema.optional(),
          userId: z.string().min(1),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.USER_UPDATE_ALL);
      await loadTargetUser(ctx.serverDB, input.userId);

      const model = new UserModel(ctx.serverDB, input.userId);

      if (input.preference) {
        await model.updatePreference(input.preference);
      }

      if (input.settings) {
        const { keyVaults, ...res } = input.settings as Partial<UserSettings>;
        const hasKeyVaultsUpdate = 'keyVaults' in (input.settings as Partial<UserSettings>);
        const nextValue: Record<string, unknown> = { ...res };

        if (hasKeyVaultsUpdate) {
          let encryptedKeyVaults: string | null = null;
          if (keyVaults) {
            const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
            encryptedKeyVaults = await gateKeeper.encrypt(JSON.stringify(keyVaults));
          }
          nextValue.keyVaults = encryptedKeyVaults;
        }

        await model.updateSetting(nextValue);
      }

      return { success: true };
    }),
});

export type AdminRouter = typeof adminRouter;
