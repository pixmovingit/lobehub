'use client';

import type { UserDefaultAgent, UserImageConfig, UserServiceModelConfig } from '@lobechat/types';
import { Button, Flexbox, Text } from '@lobehub/ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import type { PartialDeep } from 'type-fest';

import { ServiceModelFormSkeleton } from '@/components/Skeleton/Settings/tabs/ServiceModel';
import { ServiceModelForm } from '@/features/ServiceModel';
import type { StoredSystemAgent } from '@/features/ServiceModel/serviceModelState';
import ImageSettings from '@/features/Settings/image/features/Image';
import { adminService } from '@/services/admin';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

type DeploymentColumns = Pick<
  PartialDeep<{
    defaultAgent: UserDefaultAgent;
    image: UserImageConfig;
    systemAgent: UserServiceModelConfig;
  }>,
  'defaultAgent' | 'image' | 'systemAgent'
>;

const ServiceModelPanel = memo(() => {
  const { t } = useTranslation('setting');
  const { showAiImage } = useServerConfigStore(featureFlagsSelectors);
  const { data, error, isLoading, mutate } = useSWR(['admin-system-service-model-settings'], () =>
    adminService.getSystemServiceModelSettings(),
  );

  const persist = useCallback(
    async (columns: DeploymentColumns) => {
      const next = await adminService.updateSystemServiceModelSettings({
        ...(columns.defaultAgent !== undefined
          ? { defaultAgent: columns.defaultAgent as Record<string, unknown> }
          : {}),
        ...(columns.image !== undefined
          ? { image: columns.image as Record<string, unknown> }
          : {}),
        ...(columns.systemAgent !== undefined
          ? { systemAgent: columns.systemAgent as Record<string, unknown> }
          : {}),
      });
      await mutate(next, { revalidate: false });
    },
    [mutate],
  );

  if (isLoading && !data && !error) return <ServiceModelFormSkeleton />;

  if (error && !data) {
    return (
      <Flexbox gap={8}>
        <Text type="danger">{t('adminDefaultSettings.loadFailed')}</Text>
        <Button size="small" onClick={() => mutate()}>
          {t('adminDefaultSettings.retry')}
        </Button>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={24} width="100%">
      <Text type="secondary">{t('adminDefaultSettings.serviceModelDesc')}</Text>
      <ServiceModelForm
        deployment={{
          defaultAgent: (data?.defaultAgent as UserDefaultAgent | null) || undefined,
          systemAgent: (data?.systemAgent as StoredSystemAgent | null) || undefined,
          onReplace: persist,
        }}
      />
      {showAiImage && (
        <ImageSettings
          deployment={{
            value: (data?.image as Partial<UserImageConfig> | null) || undefined,
            onChange: (image) => persist({ image }),
          }}
        />
      )}
    </Flexbox>
  );
});

ServiceModelPanel.displayName = 'AdminDefaultSettingsServiceModelPanel';

export default ServiceModelPanel;
