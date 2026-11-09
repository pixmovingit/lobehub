import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';

import { getServerFeatureFlagsValue } from '@/config/featureFlags';
import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import { buildAnalyticsConfig } from '@/libs/spaHtml';
import { getServerAuthConfig } from '@/server/globalConfig/getServerAuthConfig';
import { SystemAdminService } from '@/server/services/systemAdmin';

// The prerendered auth micro app ships without any deployment's config baked in;
// its worker reads this to fill `window.__SERVER_CONFIG__` before serving a page.
//
// Deliberately narrower than `AuthSPAServerConfig`: this endpoint is public and
// unauthenticated, so it carries only the fields the auth pages actually read.
// `enableBusinessFeatures` is not among them — it is a build-time constant.
export const GET = async () => {
  const { disableEmailPassword, enableEmailVerification, enableMagicLink, oAuthSSOProviders } =
    getServerAuthConfig();

  let needsAdminSetup = false;
  if (!ENABLE_BUSINESS_FEATURES) {
    try {
      const { serverDB } = await import('@/database/server');
      needsAdminSetup = await SystemAdminService.needsAdminSetup(serverDB);
    } catch (error) {
      console.error('[SPA Auth Config] Failed to resolve needsAdminSetup:', error);
    }
  }

  return Response.json(
    {
      analyticsConfig: buildAnalyticsConfig(),
      config: {
        disableEmailPassword,
        enableEmailVerification,
        enableMagicLink,
        needsAdminSetup,
        oAuthSSOProviders,
      },
      enableOIDC: authEnv.ENABLE_OIDC,
      featureFlags: getServerFeatureFlagsValue(),
      globalCDN: appEnv.CDN_USE_GLOBAL,
    },
    {
      headers: {
        // Bootstrap flag must not sit behind a long CDN TTL after the first admin is created.
        'Cache-Control': needsAdminSetup
          ? 'private, no-store'
          : 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
      },
    },
  );
};
