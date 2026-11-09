// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  appEnv: { CDN_USE_GLOBAL: true },
  authEnv: { ENABLE_OIDC: true },
  buildAnalyticsConfig: vi.fn(() => ({
    posthog: { debug: false, host: 'https://ph', key: 'phc' },
  })),
  getServerAuthConfig: vi.fn(() => ({
    disableEmailPassword: false,
    enableEmailVerification: true,
    enableMagicLink: false,
    oAuthSSOProviders: ['github'],
  })),
  getServerFeatureFlagsValue: vi.fn(() => ({ auth_captcha: true })),
  needsAdminSetup: vi.fn(async () => true),
}));

vi.mock('@lobechat/business-const', () => ({
  ENABLE_BUSINESS_FEATURES: false,
}));

vi.mock('@/config/featureFlags', () => ({
  getServerFeatureFlagsValue: mocks.getServerFeatureFlagsValue,
}));

vi.mock('@/envs/app', () => ({ appEnv: mocks.appEnv }));

vi.mock('@/envs/auth', () => ({ authEnv: mocks.authEnv }));

vi.mock('@/libs/spaHtml', () => ({
  buildAnalyticsConfig: mocks.buildAnalyticsConfig,
}));

vi.mock('@/server/globalConfig/getServerAuthConfig', () => ({
  getServerAuthConfig: mocks.getServerAuthConfig,
}));

vi.mock('@/database/server', () => ({
  serverDB: {},
}));

vi.mock('@/server/services/systemAdmin', () => ({
  SystemAdminService: {
    needsAdminSetup: mocks.needsAdminSetup,
  },
}));

describe('GET /webapi/auth/spa-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.needsAdminSetup.mockResolvedValue(true);
  });

  it('includes the env-level feature flags the auth shell maps onto state', async () => {
    const response = await GET();
    const body = await response.json();

    expect(mocks.getServerFeatureFlagsValue).toHaveBeenCalled();
    expect(body.featureFlags).toEqual({ auth_captcha: true });
  });

  it('exposes needsAdminSetup for the auth signup bootstrap copy', async () => {
    const response = await GET();
    const body = await response.json();

    expect(mocks.needsAdminSetup).toHaveBeenCalled();
    expect(body.config.needsAdminSetup).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
