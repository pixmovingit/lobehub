import type { UserPreference, UserSettings } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

export const adminService = {
  getUser: (userId: string) => lambdaClient.admin.getUser.query({ userId }),

  getUserSettings: (userId: string) => lambdaClient.admin.getUserSettings.query({ userId }),

  isAdmin: () => lambdaClient.admin.isAdmin.query(),

  listUsers: (params?: { limit?: number; offset?: number; query?: string }) =>
    lambdaClient.admin.listUsers.query(params ?? {}),

  setSuperAdmin: (userId: string, enabled: boolean) =>
    lambdaClient.admin.setSuperAdmin.mutate({ enabled, userId }),

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
