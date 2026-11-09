import { RBAC_PERMISSIONS } from '@lobechat/const/rbac';
import type { LobeChatDatabase } from '@lobechat/database';
import type { UserSettings } from '@lobechat/types';
import { UserPreferenceSchema, UserSettingsSchema } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { AGENT_TRANSFER_PENDING_OWNER_DELETE } from '@/database/models/agentTransferJob';
import { RbacModel } from '@/database/models/rbac';
import { SystemAiProviderModel } from '@/database/models/systemAiProvider';
import { SystemServiceModelSettingsModel } from '@/database/models/systemServiceModelSettings';
import { UserModel } from '@/database/models/user';
import { users } from '@/database/schemas/user';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { listUsersForAdmin, SystemAdminService } from '@/server/services/systemAdmin';
import { CreateAiProviderSchema } from '@/types/aiProvider';

import { assertCanDeleteAdminUser } from './deleteUserGuard';
import { assertNotSelfBan } from './selfBanGuard';

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

/**
 * Deployment-wide default settings are gated by the global super_admin role,
 * not workspace AI_PROVIDER_* grants — that role only seeds user/RBAC codes.
 */
const requireSuperAdmin = async (
  adminService: SystemAdminService,
  userId: string,
): Promise<void> => {
  if (!(await adminService.isSuperAdmin(userId))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only system administrators can manage default settings.',
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
      const [isSuperAdmin, isBootstrapAdmin] = await Promise.all([
        ctx.adminService.isSuperAdmin(input.userId),
        ctx.adminService.isBootstrapAdmin(input.userId),
      ]);

      return { ...user, isBootstrapAdmin, isSuperAdmin };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.rbac, RBAC_PERMISSIONS.USER_DELETE_ALL);
      await loadTargetUser(ctx.serverDB, input.userId);

      const [targetIsSuperAdmin, actorIsBootstrapAdmin] = await Promise.all([
        ctx.adminService.isSuperAdmin(input.userId),
        ctx.adminService.isBootstrapAdmin(ctx.userId),
      ]);

      assertCanDeleteAdminUser({
        actorIsBootstrapAdmin,
        actorUserId: ctx.userId,
        targetIsSuperAdmin,
        targetUserId: input.userId,
      });

      try {
        const result = await UserModel.deleteUser(ctx.serverDB, input.userId);
        if (!result.rowCount) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        }
      } catch (error) {
        if (error instanceof Error && error.message === AGENT_TRANSFER_PENDING_OWNER_DELETE) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot delete a user while an agent transfer is still pending.',
          });
        }
        throw error;
      }

      return { success: true };
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

      assertNotSelfBan(ctx.userId, userId, patch.banned);

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

  // ---- Default settings: deployment-wide AI providers ----

  listSystemAiProviders: adminProcedure.query(async ({ ctx }) => {
    await requireSuperAdmin(ctx.adminService, ctx.userId);
    return SystemAiProviderModel.listProviders(ctx.serverDB);
  }),

  getSystemAiProvider: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      const provider = await SystemAiProviderModel.findById(ctx.serverDB, input.id, gateKeeper);
      if (!provider) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'System AI provider not found' });
      }
      const models = await SystemAiProviderModel.listModelsByProviderId(ctx.serverDB, input.id);
      return { ...provider, models };
    }),

  createSystemAiProvider: adminProcedure
    .input(
      CreateAiProviderSchema.omit({ source: true }).extend({
        enabled: z.boolean().optional(),
        models: z
          .array(
            z.object({
              displayName: z.string().optional(),
              enabled: z.boolean().optional(),
              id: z.string().min(1),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);

      const existing = await SystemAiProviderModel.findById(ctx.serverDB, input.id);
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `System provider "${input.id}" already exists`,
        });
      }

      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      const { models, keyVaults, sdkType, settings, ...rest } = input;

      await SystemAiProviderModel.create(
        ctx.serverDB,
        {
          ...rest,
          keyVaults: keyVaults as Record<string, unknown> | undefined,
          settings: {
            ...settings,
            ...(sdkType ? { sdkType } : {}),
          },
        },
        gateKeeper,
      );

      if (models?.length) {
        for (const model of models) {
          await SystemAiProviderModel.createModel(ctx.serverDB, {
            displayName: model.displayName,
            enabled: model.enabled ?? true,
            id: model.id,
            providerId: input.id,
          });
        }
      }

      return { id: input.id };
    }),

  updateSystemAiProvider: adminProcedure
    .input(
      z
        .object({
          checkModel: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          enabled: z.boolean().optional(),
          id: z.string().min(1),
          keyVaults: z.record(z.string(), z.unknown()).optional(),
          logo: z.string().nullable().optional(),
          name: z.string().min(1).optional(),
          settings: z.record(z.string(), z.unknown()).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      const { id, ...patch } = input;
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      const updated = await SystemAiProviderModel.update(ctx.serverDB, id, patch, gateKeeper);
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'System AI provider not found' });
      }
      return { success: true };
    }),

  deleteSystemAiProvider: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      await SystemAiProviderModel.delete(ctx.serverDB, input.id);
      return { success: true };
    }),

  createSystemAiModel: adminProcedure
    .input(
      z.object({
        displayName: z.string().optional(),
        enabled: z.boolean().optional(),
        id: z.string().min(1),
        providerId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      const provider = await SystemAiProviderModel.findById(ctx.serverDB, input.providerId);
      if (!provider) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'System AI provider not found' });
      }
      await SystemAiProviderModel.createModel(ctx.serverDB, input);
      return { success: true };
    }),

  updateSystemAiModel: adminProcedure
    .input(
      z
        .object({
          description: z.string().nullable().optional(),
          displayName: z.string().nullable().optional(),
          enabled: z.boolean().optional(),
          id: z.string().min(1),
          providerId: z.string().min(1),
          sort: z.number().int().nullable().optional(),
          type: z.string().nullable().optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      const { id, providerId, ...patch } = input;
      const updated = await SystemAiProviderModel.updateModel(ctx.serverDB, providerId, id, patch);
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'System AI model not found' });
      }
      return { success: true };
    }),

  deleteSystemAiModel: adminProcedure
    .input(z.object({ id: z.string().min(1), providerId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      await SystemAiProviderModel.deleteModel(ctx.serverDB, input.providerId, input.id);
      return { success: true };
    }),

  // ---- Default settings: deployment-wide Service Model defaults ----

  getSystemServiceModelSettings: adminProcedure.query(async ({ ctx }) => {
    await requireSuperAdmin(ctx.adminService, ctx.userId);
    const row = await SystemServiceModelSettingsModel.get(ctx.serverDB);
    return {
      defaultAgent: row?.defaultAgent ?? null,
      image: row?.image ?? null,
      systemAgent: row?.systemAgent ?? null,
    };
  }),

  updateSystemServiceModelSettings: adminProcedure
    .input(
      z.object({
        defaultAgent: z.record(z.string(), z.unknown()).nullable().optional(),
        image: z.record(z.string(), z.unknown()).nullable().optional(),
        systemAgent: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireSuperAdmin(ctx.adminService, ctx.userId);
      const row = await SystemServiceModelSettingsModel.upsert(ctx.serverDB, {
        defaultAgent: input.defaultAgent ?? undefined,
        image: input.image ?? undefined,
        systemAgent: input.systemAgent ?? undefined,
      });
      return {
        defaultAgent: row.defaultAgent ?? null,
        image: row.image ?? null,
        systemAgent: row.systemAgent ?? null,
      };
    }),
});

export type AdminRouter = typeof adminRouter;
