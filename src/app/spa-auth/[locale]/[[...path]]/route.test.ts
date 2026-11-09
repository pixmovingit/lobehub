// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  needsAdminSetup: vi.fn(async () => true),
  renderSpaHtml: vi.fn(
    (_template: string, options: { cacheControl?: string; serverConfig: unknown }) =>
      new Response('ok', {
        headers: {
          'Cache-Control': options.cacheControl ?? 'no-cache',
        },
      }),
  ),
}));

vi.mock('@lobechat/business-const', () => ({
  ENABLE_BUSINESS_FEATURES: false,
}));

vi.mock('@/config/featureFlags', () => ({
  getServerFeatureFlagsValue: vi.fn(() => ({})),
}));

vi.mock('@/envs/app', () => ({
  appEnv: { CDN_USE_GLOBAL: false },
}));

vi.mock('@/envs/auth', () => ({
  authEnv: { ENABLE_OIDC: false },
}));

vi.mock('@/libs/spaHtml', () => ({
  buildAnalyticsConfig: vi.fn(() => ({})),
  fetchViteDevTemplate: vi.fn(async () => '<html></html>'),
  renderSpaHtml: mocks.renderSpaHtml,
}));

vi.mock('@/server/globalConfig/getServerAuthConfig', () => ({
  getServerAuthConfig: vi.fn(() => ({
    disableEmailPassword: false,
    enableEmailVerification: false,
    enableMagicLink: false,
    oAuthSSOProviders: [],
  })),
}));

vi.mock('@/database/server', () => ({
  serverDB: {},
}));

vi.mock('@/server/services/systemAdmin', () => ({
  SystemAdminService: {
    needsAdminSetup: mocks.needsAdminSetup,
  },
}));

vi.mock('./seoMeta', () => ({
  buildSeoMeta: vi.fn(async () => ''),
}));

describe('spa-auth route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.needsAdminSetup.mockResolvedValue(true);
  });

  it('stays force-dynamic so needsAdminSetup is never frozen from the empty-DB visit', async () => {
    const route = await import('./route');

    expect(route.dynamic).toBe('force-dynamic');
  });

  it('re-reads needsAdminSetup and disables caching while bootstrap is open', async () => {
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost/spa-auth/en-US/signin'), {
      params: Promise.resolve({ locale: 'en-US', path: ['signin'] }),
    });

    expect(mocks.needsAdminSetup).toHaveBeenCalled();
    expect(mocks.renderSpaHtml).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cacheControl: 'private, no-store',
        serverConfig: expect.objectContaining({
          config: expect.objectContaining({ needsAdminSetup: true }),
        }),
      }),
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('drops the bootstrap no-store once an admin already exists', async () => {
    mocks.needsAdminSetup.mockResolvedValue(false);
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/spa-auth/en-US/signin'), {
      params: Promise.resolve({ locale: 'en-US', path: ['signin'] }),
    });

    expect(mocks.renderSpaHtml).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cacheControl: 'no-cache',
        serverConfig: expect.objectContaining({
          config: expect.objectContaining({ needsAdminSetup: false }),
        }),
      }),
    );
  });
});
