import { Flexbox } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NotFound from '@/components/404';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import SettingsPageActions from '@/features/Settings/features/SettingsPageActions';
import { usePermission } from '@/hooks/usePermission';
import { useUserStore } from '@/store/user';
import { labPreferSelectors, preferenceSelectors } from '@/store/user/selectors';

import { AppDetailSkeleton } from './features/AppDetail';
import AppListSkeleton from './features/AppListSkeleton';
import CreateAppButton from './features/CreateAppButton';
import OAuthApps from './features/OAuthApps';
import { useOAuthAppList } from './features/useOAuthAppList';

const Page = ({ showSettingHeader = true }: { showSettingHeader?: boolean }) => {
  const { t } = useTranslation('auth');
  const { allowed: hasEditPermission } = usePermission('create_content');
  const activeWorkspaceId = useActiveWorkspaceId();
  // Same Admin-or-higher rule as `CreateAppButton`.
  const { allowed: canManageWorkspaceApps } = usePermission('manage_settings');
  const params = useParams<{ sub?: string }>();
  const canEdit = hasEditPermission && (!activeWorkspaceId || canManageWorkspaceApps);
  const [isPreferenceInit, enableOAuthApps, isAdmin] = useUserStore((s) => [
    preferenceSelectors.isPreferenceInit(s),
    labPreferSelectors.enableOAuthApps(s),
    Boolean(s.userState?.isAdmin),
  ]);
  // Admins manage the OIDC client registry from Settings → Admin; Labs still
  // unlocks the same page for non-admin developers who opted in.
  const canAccessOAuthApps = isAdmin || enableOAuthApps;

  // While the list is empty its empty state carries the Create button.
  const { data: apps } = useOAuthAppList(isPreferenceInit && canAccessOAuthApps);
  const listEmpty = apps?.length === 0;

  // Keep the page header and the body's own skeleton while preferences /
  // admin state resolve; the Create button waits because locked means 404.
  if (!isPreferenceInit)
    return (
      <>
        {showSettingHeader && <SettingHeader title={t('tab.oauthApps')} />}
        {params.sub ? <AppDetailSkeleton /> : <AppListSkeleton />}
      </>
    );
  if (!canAccessOAuthApps) return <NotFound />;

  const canCreate = !params.sub && canEdit && !listEmpty;

  return (
    <>
      {showSettingHeader ? (
        <SettingHeader extra={canCreate && <CreateAppButton />} title={t('tab.oauthApps')} />
      ) : (
        canCreate && (
          <SettingsPageActions
            // Mobile has no shared header slot; keep Create reachable above the list.
            fallback={
              <Flexbox horizontal justify={'flex-end'}>
                <CreateAppButton />
              </Flexbox>
            }
          >
            <CreateAppButton />
          </SettingsPageActions>
        )
      )}
      <OAuthApps canEdit={canEdit} />
    </>
  );
};

export default Page;
