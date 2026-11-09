'use client';

import { DEFAULT_IMAGE_CONFIG } from '@lobechat/const';
import { type UserImageConfig } from '@lobechat/types';
import { Flexbox, Icon, Spin, Tooltip } from '@lobehub/ui';
import { Form, type FormGroupItem, useForm } from '@lobehub/ui/form';
import { CircleHelpIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FormSliderWithInput } from '@/components/FormInput';
import { ImageSettingsSkeleton } from '@/components/Skeleton/Settings/tabs/ServiceModel';
import { FORM_STYLE } from '@/const/layoutTokens';
import { MAX_DEFAULT_IMAGE_NUM, MIN_DEFAULT_IMAGE_NUM } from '@/const/settings';
import { SettingsSearchAnchor } from '@/features/SettingsSearch/anchor';
import { usePermission } from '@/hooks/usePermission';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/slices/settings/selectors';

export interface ImageSettingsDeploymentSource {
  onChange: (image: UserImageConfig) => Promise<void>;
  value?: Partial<UserImageConfig> | null;
}

interface ImageSettingsProps {
  /** Edit deployment-wide image defaults instead of the signed-in user. */
  deployment?: ImageSettingsDeploymentSource;
}

const ImageSettings = memo(({ deployment }: ImageSettingsProps) => {
  const { t } = useTranslation('setting');
  const { allowed: personalCanManage, reason } = usePermission('manage_settings');
  const canManageServiceModel = deployment ? true : personalCanManage;
  const [isUpdating, setIsUpdating] = useState(false);

  const userImageSettings = useUserStore(settingsSelectors.currentImageSettings);
  const [setSettings, isUserStateInit] = useUserStore((s) => [s.setSettings, s.isUserStateInit]);
  const imageSettings: UserImageConfig = deployment
    ? { ...DEFAULT_IMAGE_CONFIG, ...deployment.value }
    : userImageSettings;
  const form = useForm<UserImageConfig>({
    initialValues: imageSettings,
    values: imageSettings,
    onValuesChange: async (values) => {
      if (!canManageServiceModel) return;

      setIsUpdating(true);
      try {
        if (deployment) await deployment.onChange({ ...imageSettings, ...values });
        else await setSettings({ image: values });
      } finally {
        setIsUpdating(false);
      }
    },
  });

  if (!deployment && !isUserStateInit) {
    // Same group the service-model tab skeleton draws below the model cards.
    return <ImageSettingsSkeleton />;
  }

  const items: FormGroupItem<UserImageConfig>[] = [
    {
      children: [
        {
          desc: t('settingImage.defaultCount.desc'),
          label: (
            <Flexbox horizontal align={'center'} gap={4}>
              {t('settingImage.defaultCount.label')}
              {!deployment && reason && (
                <Tooltip title={reason}>
                  <Icon icon={CircleHelpIcon} size={14} style={{ cursor: 'help' }} />
                </Tooltip>
              )}
            </Flexbox>
          ),
          name: 'defaultImageNum',
          render: ({ value, onChange }) => (
            <FormSliderWithInput
              disabled={isUpdating || !canManageServiceModel}
              max={MAX_DEFAULT_IMAGE_NUM}
              min={MIN_DEFAULT_IMAGE_NUM}
              step={1}
              value={value}
              onChange={onChange}
            />
          ),
        },
      ],
      extra: isUpdating ? <Spin size="small" style={{ opacity: 0.6 }} /> : undefined,
      title: (
        <SettingsSearchAnchor id={'service-model-image'}>
          {t('settingImage.defaultCount.title')}
        </SettingsSearchAnchor>
      ),
    },
  ];

  return (
    <Form
      collapsible={false}
      form={form}
      items={items}
      itemsType={'group'}
      variant={'filled'}
      {...FORM_STYLE}
    />
  );
});

ImageSettings.displayName = 'ImageSettings';

export default ImageSettings;
