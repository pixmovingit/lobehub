import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDefaults: vi.fn(),
  updateSetting: vi.fn(),
  identify: vi.fn(),
  track: vi.fn(),
  promoteBootstrapAdminIfNeeded: vi.fn(),
}));

vi.mock('@lobechat/business-const', () => ({
  ENABLE_BUSINESS_FEATURES: false,
}));

vi.mock('@/business/server/user', () => ({
  initNewUserForBusiness: vi.fn(),
}));

vi.mock('@/database/models/systemServiceModelSettings', () => ({
  SystemServiceModelSettingsModel: {
    get: mocks.getDefaults,
  },
}));

vi.mock('@/database/models/user', () => ({
  UserModel: class {
    static getUserApiKeys = vi.fn();
    updateSetting = mocks.updateSetting;
    constructor(_db: unknown, _userId: string) {}
  },
}));

vi.mock('@/libs/analytics', () => ({
  initializeServerAnalytics: vi.fn(async () => ({
    identify: mocks.identify,
    track: mocks.track,
  })),
}));

vi.mock('@/server/services/systemAdmin', () => ({
  SystemAdminService: class {
    promoteBootstrapAdminIfNeeded = mocks.promoteBootstrapAdminIfNeeded;
  },
}));

describe('UserService.initUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDefaults.mockResolvedValue(undefined);
    mocks.updateSetting.mockResolvedValue(undefined);
    mocks.promoteBootstrapAdminIfNeeded.mockResolvedValue(undefined);
  });

  it('copies deployment Service Model defaults into the new user settings', async () => {
    mocks.getDefaults.mockResolvedValue({
      defaultAgent: { config: { model: 'gpt-6.1-terra', provider: 'pix' } },
      image: { defaultImageNum: 1 },
      systemAgent: { verify: { model: 'gpt-6-luna', provider: 'pix' } },
    });

    const { UserService } = await import('./index');
    await new UserService({} as never).initUser({ id: 'user_new' });

    expect(mocks.updateSetting).toHaveBeenCalledWith({
      defaultAgent: { config: { model: 'gpt-6.1-terra', provider: 'pix' } },
      image: { defaultImageNum: 1 },
      systemAgent: { verify: { model: 'gpt-6-luna', provider: 'pix' } },
    });
  });

  it('skips seeding when no deployment defaults are configured', async () => {
    const { UserService } = await import('./index');
    await new UserService({} as never).initUser({ id: 'user_new' });

    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it('still finishes registration analytics when seeding fails', async () => {
    mocks.getDefaults.mockRejectedValue(new Error('db down'));

    const { UserService } = await import('./index');
    await new UserService({} as never).initUser({
      email: 'a@b.co',
      id: 'user_new',
      username: 'alice',
    });

    expect(mocks.identify).toHaveBeenCalledWith(
      'user_new',
      expect.objectContaining({ email: 'a@b.co', username: 'alice' }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'user_register_completed', userId: 'user_new' }),
    );
  });
});
