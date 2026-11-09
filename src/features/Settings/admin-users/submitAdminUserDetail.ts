import type { UserPreference, UserSettings } from '@lobechat/types';

import { adminService } from '@/services/admin';

export class InvalidAdminUserJsonError extends Error {
  constructor() {
    super('Invalid admin user JSON');
    this.name = 'InvalidAdminUserJsonError';
  }
}

export interface AdminUserDetailSubmitValues {
  banReason: string;
  banned: boolean;
  fullName: string;
  isSuperAdmin: boolean;
  preferenceJson: string;
  settingsJson: string;
  username: string;
}

export const parseAdminUserJsonFields = (values: AdminUserDetailSubmitValues) => {
  try {
    return {
      preference: JSON.parse(values.preferenceJson) as UserPreference,
      settings: JSON.parse(values.settingsJson) as Partial<UserSettings>,
    };
  } catch {
    throw new InvalidAdminUserJsonError();
  }
};

export class SelfBanNotAllowedError extends Error {
  constructor() {
    super('Cannot ban your own account');
    this.name = 'SelfBanNotAllowedError';
  }
}

export const buildAdminUserUpdatePatch = (
  userId: string,
  values: AdminUserDetailSubmitValues,
  currentUserId?: string | null,
) => {
  const isSelf = Boolean(currentUserId) && currentUserId === userId;

  if (isSelf && values.banned) {
    throw new SelfBanNotAllowedError();
  }

  return {
    fullName: values.fullName || null,
    userId,
    username: values.username || null,
    ...(isSelf
      ? {}
      : {
          banReason: values.banned ? values.banReason || null : null,
          banned: values.banned,
        }),
  };
};

export const submitAdminUserDetail = async (
  userId: string,
  values: AdminUserDetailSubmitValues,
  currentUserId?: string | null,
) => {
  const { preference, settings } = parseAdminUserJsonFields(values);
  const updatePatch = buildAdminUserUpdatePatch(userId, values, currentUserId);

  await adminService.updateUser(updatePatch);
  await adminService.setSuperAdmin(userId, values.isSuperAdmin);
  await adminService.updateUserSettings({
    preference,
    settings,
    userId,
  });
};
