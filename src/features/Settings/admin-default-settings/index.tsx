'use client';

import { Flexbox, Tabs, Text } from '@lobehub/ui';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserStore } from '@/store/user';

import ProvidersPanel from './ProvidersPanel';
import ServiceModelPanel from './ServiceModelPanel';

type AdminDefaultTab = 'providers' | 'serviceModel';

const AdminDefaultSettings = memo(() => {
  const { t } = useTranslation('setting');
  const isAdmin = useUserStore((s) => Boolean(s.userState?.isAdmin));
  const [tab, setTab] = useState<AdminDefaultTab>('providers');

  if (!isAdmin) {
    return (
      <Flexbox gap={8} padding={24}>
        <Text type="secondary">{t('adminDefaultSettings.forbidden')}</Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={24} width="100%">
      <Text type="secondary">{t('adminDefaultSettings.desc')}</Text>
      <Tabs
        activeKey={tab}
        items={[
          { key: 'providers', label: t('adminDefaultSettings.tab.providers') },
          { key: 'serviceModel', label: t('adminDefaultSettings.tab.serviceModel') },
        ]}
        variant="square"
        onChange={(key) => setTab(key as AdminDefaultTab)}
      />
      {tab === 'providers' ? <ProvidersPanel /> : <ServiceModelPanel />}
    </Flexbox>
  );
});

AdminDefaultSettings.displayName = 'AdminDefaultSettings';

export default AdminDefaultSettings;
