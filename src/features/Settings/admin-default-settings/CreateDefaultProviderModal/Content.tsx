'use client';

import {
  Button,
  Flexbox,
  Input,
  InputPassword,
  Select,
  Switch,
  Text,
  TextArea,
  toast,
  useModalContext,
} from '@lobehub/ui';
import { Form, useForm } from '@lobehub/ui/form';
import { AiProviderBaseURLSchema } from 'model-bank/aiProvider';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderIcon } from '@/components/LobeIcons';
import { adminService } from '@/services/admin';
import { type CreateAiProviderParams } from '@/types/aiProvider';

import {
  KeyVaultsConfigKey,
  LLMProviderApiTokenKey,
  LLMProviderBaseUrlKey,
} from '../../provider/const';
import { CUSTOM_PROVIDER_SDK_OPTIONS } from '../../provider/features/customProviderSdkOptions';
import { normalizeProviderSettings } from '../../provider/features/providerSettings';

interface CreateFormValues extends CreateAiProviderParams {
  enabled?: boolean;
  modelId?: string;
  modelName?: string;
}

export interface CreateDefaultProviderContentProps {
  existingIds: string[];
  onSuccess: (id: string) => void | Promise<void>;
}

const CreateDefaultProviderContent = memo<CreateDefaultProviderContentProps>(
  ({ existingIds, onSuccess }) => {
    const { t } = useTranslation('setting');
    const { t: tProvider } = useTranslation('modelProvider');
    const [loading, setLoading] = useState(false);
    const { close } = useModalContext();

    const form = useForm<CreateFormValues>({
      initialValues: { enabled: true },
      onSubmit: async (values) => {
        setLoading(true);
        try {
          const settings = normalizeProviderSettings({
            nextSettings: values.settings,
          }) as CreateAiProviderParams['settings'];

          await adminService.createSystemAiProvider({
            description: values.description,
            enabled: values.enabled ?? true,
            id: values.id,
            keyVaults: values.keyVaults,
            logo: values.logo,
            models: values.modelId
              ? [{ displayName: values.modelName || values.modelId, id: values.modelId }]
              : undefined,
            name: values.name || values.id,
            settings,
          });

          toast.success(t('adminDefaultSettings.createSuccess'));
          await onSuccess(values.id);
          close();
        } catch (error) {
          console.error(error);
          const message = error instanceof Error ? error.message : undefined;
          toast.error(message || t('adminDefaultSettings.createFailed'));
        } finally {
          setLoading(false);
        }
      },
    });

    const itemStyle = { paddingBlock: 0 };

    return (
      <Form form={form} layout="vertical">
        <Flexbox gap={12}>
          <Text type="secondary">{t('adminDefaultSettings.createDesc')}</Text>

          <Form.Field
            extra={tProvider('createNewAiProvider.id.desc')}
            label={tProvider('createNewAiProvider.id.title')}
            name="id"
            required={tProvider('createNewAiProvider.id.required')}
            style={itemStyle}
            validate={(value?: string) => {
              if (!value) return;
              if (!/^[\d_a-z-]+$/.test(value)) {
                return tProvider('createNewAiProvider.id.format');
              }
              if (existingIds.includes(value)) {
                return tProvider('createNewAiProvider.id.duplicate');
              }
            }}
          >
            <Input
              autoFocus
              placeholder={tProvider('createNewAiProvider.id.placeholder')}
              variant="filled"
            />
          </Form.Field>

          <Form.Field
            label={tProvider('createNewAiProvider.name.title')}
            name="name"
            style={itemStyle}
          >
            <Input
              placeholder={tProvider('createNewAiProvider.name.placeholder')}
              variant="filled"
            />
          </Form.Field>

          <Form.Field
            label={tProvider('createNewAiProvider.description.title')}
            name="description"
            style={itemStyle}
          >
            <TextArea
              placeholder={tProvider('createNewAiProvider.description.placeholder')}
              style={{ minHeight: 64 }}
              variant="filled"
            />
          </Form.Field>

          <Form.Field
            label={tProvider('createNewAiProvider.sdkType.title')}
            name="settings.sdkType"
            required={tProvider('createNewAiProvider.sdkType.required')}
            style={itemStyle}
          >
            <Select
              options={CUSTOM_PROVIDER_SDK_OPTIONS}
              placeholder={tProvider('createNewAiProvider.sdkType.placeholder')}
              variant="filled"
              optionRender={({ label, value }) => {
                const iconProvider = value === 'router' ? 'newapi' : (value as string);
                return (
                  <Flexbox horizontal align="center" gap={8}>
                    <ProviderIcon provider={iconProvider} size={18} />
                    {label}
                  </Flexbox>
                );
              }}
            />
          </Form.Field>

          <Form.Field
            label={tProvider('createNewAiProvider.proxyUrl.title')}
            name={`${KeyVaultsConfigKey}.${LLMProviderBaseUrlKey}`}
            required={tProvider('createNewAiProvider.proxyUrl.required')}
            style={itemStyle}
            validate={(value?: string) =>
              !value || AiProviderBaseURLSchema.safeParse(value).success
                ? undefined
                : tProvider('providerModels.config.baseURL.invalid')
            }
          >
            <Input
              allowClear
              placeholder={tProvider('createNewAiProvider.proxyUrl.placeholder')}
              variant="filled"
            />
          </Form.Field>

          <Form.Field
            label={tProvider('createNewAiProvider.apiKey.title')}
            name={`${KeyVaultsConfigKey}.${LLMProviderApiTokenKey}`}
            style={itemStyle}
          >
            <InputPassword
              autoComplete="new-password"
              placeholder={tProvider('createNewAiProvider.apiKey.placeholder')}
              variant="filled"
            />
          </Form.Field>

          <Form.Field
            label={t('adminDefaultSettings.modelIdLabel')}
            name="modelId"
            style={itemStyle}
          >
            <Input placeholder={t('adminDefaultSettings.modelIdPlaceholder')} variant="filled" />
          </Form.Field>

          <Form.Field
            label={t('adminDefaultSettings.modelNameLabel')}
            name="modelName"
            style={itemStyle}
          >
            <Input placeholder={t('adminDefaultSettings.modelNamePlaceholder')} variant="filled" />
          </Form.Field>

          <Form.Field
            label={t('adminDefaultSettings.enabledLabel')}
            name="enabled"
            style={itemStyle}
            valuePropName="checked"
          >
            <Switch />
          </Form.Field>

          <Button block htmlType="submit" loading={loading} type="primary">
            {t('adminDefaultSettings.create')}
          </Button>
        </Flexbox>
      </Form>
    );
  },
);

CreateDefaultProviderContent.displayName = 'CreateDefaultProviderContent';

export default CreateDefaultProviderContent;
