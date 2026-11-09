import type { UserPreference, UserSettings } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';
import type { CreateAiProviderParams } from '@/types/aiProvider';

export const adminService = {
  createSystemAiModel: (params: {
    displayName?: string;
    enabled?: boolean;
    id: string;
    providerId: string;
  }) => lambdaClient.admin.createSystemAiModel.mutate(params),

  createSystemAiProvider: (
    params: Omit<CreateAiProviderParams, 'source'> & {
      enabled?: boolean;
      models?: { displayName?: string; enabled?: boolean; id: string }[];
    },
  ) => lambdaClient.admin.createSystemAiProvider.mutate(params),

  deleteSystemAiModel: (params: { id: string; providerId: string }) =>
    lambdaClient.admin.deleteSystemAiModel.mutate(params),

  deleteSystemAiProvider: (id: string) => lambdaClient.admin.deleteSystemAiProvider.mutate({ id }),

  updateSystemAiModel: (params: {
    description?: string | null;
    displayName?: string | null;
    enabled?: boolean;
    id: string;
    providerId: string;
    sort?: number | null;
    type?: string | null;
  }) => lambdaClient.admin.updateSystemAiModel.mutate(params),

  deleteUser: (userId: string) => lambdaClient.admin.deleteUser.mutate({ userId }),

  getSystemAiProvider: (id: string) => lambdaClient.admin.getSystemAiProvider.query({ id }),

  getSystemServiceModelSettings: () => lambdaClient.admin.getSystemServiceModelSettings.query(),

  getUser: (userId: string) => lambdaClient.admin.getUser.query({ userId }),

  getUserSettings: (userId: string) => lambdaClient.admin.getUserSettings.query({ userId }),

  isAdmin: () => lambdaClient.admin.isAdmin.query(),

  listSystemAiProviders: () => lambdaClient.admin.listSystemAiProviders.query(),

  listUsers: (params?: { limit?: number; offset?: number; query?: string }) =>
    lambdaClient.admin.listUsers.query(params ?? {}),

  setSuperAdmin: (userId: string, enabled: boolean) =>
    lambdaClient.admin.setSuperAdmin.mutate({ enabled, userId }),

  updateSystemAiProvider: (params: {
    checkModel?: string | null;
    description?: string | null;
    enabled?: boolean;
    id: string;
    keyVaults?: Record<string, unknown>;
    logo?: string | null;
    name?: string;
    settings?: Record<string, unknown>;
  }) => lambdaClient.admin.updateSystemAiProvider.mutate(params),

  updateSystemServiceModelSettings: (params: {
    defaultAgent?: Record<string, unknown> | null;
    image?: Record<string, unknown> | null;
    systemAgent?: Record<string, unknown> | null;
  }) => lambdaClient.admin.updateSystemServiceModelSettings.mutate(params),

  updateUser: (params: {
    banReason?: string | null;
    banned?: boolean;
    fullName?: string | null;
    userId: string;
    username?: string | null;
  }) => lambdaClient.admin.updateUser.mutate(params),

  updateUserSettings: (params: {
    preference?: UserPreference;
    settings?: Partial<UserSettings>;
    userId: string;
  }) => lambdaClient.admin.updateUserSettings.mutate(params),
};
