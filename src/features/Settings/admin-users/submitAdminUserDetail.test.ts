import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminService } from '@/services/admin';

import {
  buildAdminUserUpdatePatch,
  InvalidAdminUserJsonError,
  parseAdminUserJsonFields,
  SelfBanNotAllowedError,
  submitAdminUserDetail,
} from './submitAdminUserDetail';

vi.mock('@/services/admin', () => ({
  adminService: {
    setSuperAdmin: vi.fn(),
    updateUser: vi.fn(),
    updateUserSettings: vi.fn(),
  },
}));

const validValues = {
  banReason: 'spam',
  banned: true,
  fullName: 'Ada',
  isSuperAdmin: false,
  preferenceJson: '{"theme":"dark"}',
  settingsJson: '{"fontSize":14}',
  username: 'ada',
};

describe('parseAdminUserJsonFields', () => {
  it('parses settings and preference JSON', () => {
    expect(parseAdminUserJsonFields(validValues)).toEqual({
      preference: { theme: 'dark' },
      settings: { fontSize: 14 },
    });
  });

  it('throws InvalidAdminUserJsonError for broken JSON', () => {
    expect(() =>
      parseAdminUserJsonFields({
        ...validValues,
        settingsJson: '{broken',
      }),
    ).toThrow(InvalidAdminUserJsonError);
  });
});

describe('buildAdminUserUpdatePatch', () => {
  it('includes ban fields when editing another user', () => {
    expect(buildAdminUserUpdatePatch('user_1', validValues, 'admin_1')).toEqual({
      banReason: 'spam',
      banned: true,
      fullName: 'Ada',
      userId: 'user_1',
      username: 'ada',
    });
  });

  it('omits ban fields when saving the signed-in admin without a self-ban', () => {
    expect(
      buildAdminUserUpdatePatch(
        'admin_1',
        {
          ...validValues,
          banned: false,
        },
        'admin_1',
      ),
    ).toEqual({
      fullName: 'Ada',
      userId: 'admin_1',
      username: 'ada',
    });
  });

  it('rejects an attempt to ban the signed-in admin', () => {
    expect(() => buildAdminUserUpdatePatch('admin_1', validValues, 'admin_1')).toThrow(
      SelfBanNotAllowedError,
    );
  });
});

describe('submitAdminUserDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates user profile, admin flag, and settings', async () => {
    await submitAdminUserDetail('user_1', validValues, 'admin_1');

    expect(adminService.updateUser).toHaveBeenCalledWith({
      banReason: 'spam',
      banned: true,
      fullName: 'Ada',
      userId: 'user_1',
      username: 'ada',
    });
    expect(adminService.setSuperAdmin).toHaveBeenCalledWith('user_1', false);
    expect(adminService.updateUserSettings).toHaveBeenCalledWith({
      preference: { theme: 'dark' },
      settings: { fontSize: 14 },
      userId: 'user_1',
    });
  });

  it('clears banReason when the user is not banned', async () => {
    await submitAdminUserDetail(
      'user_1',
      {
        ...validValues,
        banReason: 'should-clear',
        banned: false,
      },
      'admin_1',
    );

    expect(adminService.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        banReason: null,
        banned: false,
      }),
    );
  });

  it('rejects invalid JSON before calling admin APIs', async () => {
    await expect(
      submitAdminUserDetail(
        'user_1',
        {
          ...validValues,
          preferenceJson: 'not-json',
        },
        'admin_1',
      ),
    ).rejects.toBeInstanceOf(InvalidAdminUserJsonError);

    expect(adminService.updateUser).not.toHaveBeenCalled();
    expect(adminService.setSuperAdmin).not.toHaveBeenCalled();
    expect(adminService.updateUserSettings).not.toHaveBeenCalled();
  });

  it('rejects self-ban before calling admin APIs', async () => {
    await expect(submitAdminUserDetail('admin_1', validValues, 'admin_1')).rejects.toBeInstanceOf(
      SelfBanNotAllowedError,
    );

    expect(adminService.updateUser).not.toHaveBeenCalled();
  });
});
