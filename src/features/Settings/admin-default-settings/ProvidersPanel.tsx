'use client';

import {
  Button,
  confirmModal,
  Flexbox,
  Input,
  InputPassword,
  Select,
  Switch,
  Text,
  TextArea,
  toast,
} from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { ProviderIcon } from '@/components/LobeIcons';
import { adminService } from '@/services/admin';
import { getAiInfraStoreState } from '@/store/aiInfra';
import { sx } from '@/styles/sx';
import { type CreateAiProviderParams } from '@/types/aiProvider';

import { CUSTOM_PROVIDER_SDK_OPTIONS } from '../provider/features/customProviderSdkOptions';
import { normalizeProviderSettings } from '../provider/features/providerSettings';
import { createCreateDefaultProviderModal } from './CreateDefaultProviderModal';

const refreshUserProviderCatalog = async () => {
  // Admin defaults are merged into every user's provider list; refresh the
  // current session so toggling enable immediately shows up under AI Providers.
  await getAiInfraStoreState().refreshAiProviderList();
};

const refreshUserProviderRuntime = async () => {
  await getAiInfraStoreState().refreshAiProviderRuntimeState();
};

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    alignItems: 'center',
    backgroundColor: { 'default': 'transparent', ':hover': cssVar.colorFillTertiary },
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: cssVar.borderRadiusLG,
    borderStyle: 'solid',
    borderWidth: 1,
    cursor: 'pointer',
    display: 'flex',
    gap: 12,
    justifyContent: 'space-between',
    paddingBlock: 12,
    paddingInline: 16,
    textAlign: 'start',
    width: '100%',
  },
  rowActive: {
    backgroundColor: cssVar.colorPrimaryBg,
    borderColor: cssVar.colorPrimaryBorder,
  },
  meta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  panel: {
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: cssVar.borderRadiusLG,
    borderStyle: 'solid',
    borderWidth: 1,
    padding: 16,
  },
  modelRow: {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
    justifyContent: 'space-between',
  },
  modelActions: {
    alignItems: 'center',
    display: 'flex',
    flexShrink: 0,
    gap: 4,
  },
  modelEditFields: {
    display: 'flex',
    flex: '1',
    gap: 8,
    minWidth: 0,
  },
});

const ProvidersPanel = memo(() => {
  const { t } = useTranslation('setting');
  const { t: tProvider } = useTranslation('modelProvider');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modelId, setModelId] = useState('');
  const [modelName, setModelName] = useState('');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [editingProvider, setEditingProvider] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSdkType, setEditSdkType] = useState<string | undefined>();
  const [editBaseURL, setEditBaseURL] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const { data, error, isLoading, mutate } = useSWR(['admin-system-ai-providers'], () =>
    adminService.listSystemAiProviders(),
  );

  const { data: detail, mutate: mutateDetail } = useSWR(
    selectedId ? ['admin-system-ai-provider', selectedId] : null,
    () => adminService.getSystemAiProvider(selectedId!),
  );

  const startEditProvider = () => {
    if (!detail) return;
    setEditName(detail.name || detail.id);
    setEditDescription(detail.description || '');
    setEditSdkType((detail.settings as { sdkType?: string } | undefined)?.sdkType);
    setEditBaseURL(String((detail.keyVaults as { baseURL?: string } | undefined)?.baseURL || ''));
    setEditApiKey(String((detail.keyVaults as { apiKey?: string } | undefined)?.apiKey || ''));
    setEditingProvider(true);
  };

  const openCreateModal = () => {
    createCreateDefaultProviderModal({
      existingIds: (data ?? []).map((provider) => provider.id),
      onSuccess: async (id) => {
        await mutate();
        await refreshUserProviderCatalog();
        setSelectedId(id);
        setEditingProvider(false);
        setEditingModelId(null);
      },
    });
  };

  return (
    <Flexbox gap={12} width="100%">
        <Flexbox horizontal align="center" justify="space-between">
          <Text strong>{t('adminDefaultSettings.providersTitle')}</Text>
          <Button icon={Plus} type="primary" onClick={openCreateModal}>
            {t('adminDefaultSettings.createTitle')}
          </Button>
        </Flexbox>

        {isLoading && <Text type="secondary">{t('adminDefaultSettings.loading')}</Text>}
        {error && (
          <Flexbox gap={8}>
            <Text type="danger">{t('adminDefaultSettings.loadFailed')}</Text>
            <Button size="small" onClick={() => mutate()}>
              {t('adminDefaultSettings.retry')}
            </Button>
          </Flexbox>
        )}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <Text type="secondary">{t('adminDefaultSettings.empty')}</Text>
        )}

        <div {...sx(styles.list)}>
          {data?.map((provider) => (
            <div
              {...sx(styles.row, selectedId === provider.id && styles.rowActive)}
              key={provider.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedId(provider.id);
                setEditingModelId(null);
                setEditingProvider(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(provider.id);
                  setEditingModelId(null);
                  setEditingProvider(false);
                }
              }}
            >
              <div {...sx(styles.meta)}>
                <Text ellipsis strong>
                  {provider.name || provider.id}
                </Text>
                <Text ellipsis fontSize={12} type="secondary">
                  {provider.id}
                </Text>
              </div>
              <span
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                role="presentation"
              >
                <Switch
                  checked={provider.enabled}
                  onChange={async (enabled) => {
                    await adminService.updateSystemAiProvider({ enabled, id: provider.id });
                    await mutate();
                    if (selectedId === provider.id) await mutateDetail();
                    await refreshUserProviderCatalog();
                  }}
                />
              </span>
            </div>
          ))}
        </div>

        {detail && (
          <div {...sx(styles.panel)}>
            <Flexbox gap={12}>
              <Flexbox horizontal align="center" justify="space-between">
                <div {...sx(styles.meta)}>
                  <Text strong>{detail.name}</Text>
                  <Text fontSize={12} type="secondary">
                    {detail.id}
                  </Text>
                </div>
                <Flexbox horizontal gap={4}>
                  {editingProvider ? (
                    <>
                      <Button
                        icon={Check}
                        loading={savingProvider}
                        size="small"
                        type="primary"
                        onClick={async () => {
                          setSavingProvider(true);
                          try {
                            const settings = normalizeProviderSettings({
                              nextSettings: {
                                ...detail.settings,
                                ...(editSdkType
                                  ? {
                                      sdkType: editSdkType as NonNullable<
                                        CreateAiProviderParams['settings']
                                      >['sdkType'],
                                    }
                                  : {}),
                              },
                            });

                            await adminService.updateSystemAiProvider({
                              description: editDescription.trim() || null,
                              id: detail.id,
                              keyVaults: {
                                apiKey: editApiKey.trim() || undefined,
                                baseURL: editBaseURL.trim() || undefined,
                              },
                              name: editName.trim() || detail.id,
                              settings: settings as Record<string, unknown> | undefined,
                            });
                            toast.success(t('adminDefaultSettings.providerSaveSuccess'));
                            setEditingProvider(false);
                            await Promise.all([mutate(), mutateDetail()]);
                            await refreshUserProviderCatalog();
                          } catch (error) {
                            console.error(error);
                            toast.error(t('adminDefaultSettings.providerSaveFailed'));
                          } finally {
                            setSavingProvider(false);
                          }
                        }}
                      >
                        {t('adminDefaultSettings.save')}
                      </Button>
                      <Button icon={X} size="small" onClick={() => setEditingProvider(false)}>
                        {t('adminDefaultSettings.cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button icon={Pencil} size="small" onClick={startEditProvider}>
                      {t('adminDefaultSettings.edit')}
                    </Button>
                  )}
                  <Button
                    danger
                    icon={Trash2}
                    size="small"
                    onClick={() => {
                      confirmModal({
                        okButtonProps: { danger: true },
                        onOk: async () => {
                          await adminService.deleteSystemAiProvider(detail.id);
                          toast.success(t('adminDefaultSettings.deleteSuccess'));
                          setSelectedId(null);
                          setEditingProvider(false);
                          await mutate();
                          await refreshUserProviderCatalog();
                        },
                        title: t('adminDefaultSettings.deleteConfirm', { name: detail.name }),
                      });
                    }}
                  >
                    {t('adminDefaultSettings.delete')}
                  </Button>
                </Flexbox>
              </Flexbox>

              {editingProvider ? (
                <Flexbox gap={12}>
                  <Input
                    placeholder={tProvider('createNewAiProvider.name.placeholder')}
                    value={editName}
                    variant="filled"
                    onChange={(event) => setEditName(event.target.value)}
                  />
                  <TextArea
                    placeholder={tProvider('createNewAiProvider.description.placeholder')}
                    style={{ minHeight: 64 }}
                    value={editDescription}
                    variant="filled"
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                  <Select
                    options={CUSTOM_PROVIDER_SDK_OPTIONS}
                    placeholder={tProvider('createNewAiProvider.sdkType.placeholder')}
                    value={editSdkType}
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
                    onChange={(value) => setEditSdkType(value as string)}
                  />
                  <Input
                    allowClear
                    placeholder={tProvider('createNewAiProvider.proxyUrl.placeholder')}
                    value={editBaseURL}
                    variant="filled"
                    onChange={(event) => setEditBaseURL(event.target.value)}
                  />
                  <InputPassword
                    autoComplete="new-password"
                    placeholder={tProvider('createNewAiProvider.apiKey.placeholder')}
                    value={editApiKey}
                    variant="filled"
                    onChange={(event) => setEditApiKey(event.target.value)}
                  />
                </Flexbox>
              ) : (
                <Text type="secondary">{detail.description || detail.id}</Text>
              )}

              <Text strong>{t('adminDefaultSettings.modelsTitle')}</Text>
              {(detail.models?.length ?? 0) === 0 && (
                <Text type="secondary">{t('adminDefaultSettings.modelsEmpty')}</Text>
              )}
              {detail.models?.map((model) => {
                const isEditing = editingModelId === model.id;

                return (
                  <div {...sx(styles.modelRow)} key={model.id}>
                    {isEditing ? (
                      <div {...sx(styles.modelEditFields)}>
                        <Input
                          placeholder={t('adminDefaultSettings.modelNamePlaceholder')}
                          value={editingModelName}
                          variant="filled"
                          onChange={(event) => setEditingModelName(event.target.value)}
                        />
                        <Text ellipsis fontSize={12} type="secondary">
                          {model.id}
                        </Text>
                      </div>
                    ) : (
                      <Text>
                        {model.displayName || model.id}
                        <Text fontSize={12} type="secondary">
                          {' '}
                          ({model.id})
                        </Text>
                      </Text>
                    )}
                    <div {...sx(styles.modelActions)}>
                      <Switch
                        checked={Boolean(model.enabled)}
                        onChange={async (enabled) => {
                          await adminService.updateSystemAiModel({
                            enabled,
                            id: model.id,
                            providerId: detail.id,
                          });
                          await mutateDetail();
                          await refreshUserProviderRuntime();
                        }}
                      />
                      {isEditing ? (
                        <>
                          <Button
                            icon={Check}
                            loading={savingModel}
                            size="small"
                            type="primary"
                            onClick={async () => {
                              setSavingModel(true);
                              try {
                                await adminService.updateSystemAiModel({
                                  displayName: editingModelName.trim() || model.id,
                                  id: model.id,
                                  providerId: detail.id,
                                });
                                toast.success(t('adminDefaultSettings.modelSaveSuccess'));
                                setEditingModelId(null);
                                await mutateDetail();
                                await refreshUserProviderRuntime();
                              } catch (error) {
                                console.error(error);
                                toast.error(t('adminDefaultSettings.modelSaveFailed'));
                              } finally {
                                setSavingModel(false);
                              }
                            }}
                          />
                          <Button icon={X} size="small" onClick={() => setEditingModelId(null)} />
                        </>
                      ) : (
                        <Button
                          icon={Pencil}
                          size="small"
                          onClick={() => {
                            setEditingModelId(model.id);
                            setEditingModelName(model.displayName || model.id);
                          }}
                        />
                      )}
                      <Button
                        danger
                        icon={Trash2}
                        size="small"
                        onClick={() => {
                          confirmModal({
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              await adminService.deleteSystemAiModel({
                                id: model.id,
                                providerId: detail.id,
                              });
                              if (editingModelId === model.id) setEditingModelId(null);
                              await mutateDetail();
                              await refreshUserProviderRuntime();
                            },
                            title: t('adminDefaultSettings.modelDeleteConfirm', {
                              name: model.displayName || model.id,
                            }),
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              <Flexbox horizontal gap={8}>
                <Input
                  placeholder={t('adminDefaultSettings.modelIdPlaceholder')}
                  value={modelId}
                  variant="filled"
                  onChange={(event) => setModelId(event.target.value)}
                />
                <Input
                  placeholder={t('adminDefaultSettings.modelNamePlaceholder')}
                  value={modelName}
                  variant="filled"
                  onChange={(event) => setModelName(event.target.value)}
                />
                <Button
                  disabled={!modelId.trim()}
                  icon={Plus}
                  onClick={async () => {
                    await adminService.createSystemAiModel({
                      displayName: modelName.trim() || modelId.trim(),
                      id: modelId.trim(),
                      providerId: detail.id,
                    });
                    setModelId('');
                    setModelName('');
                    await mutateDetail();
                    await refreshUserProviderRuntime();
                  }}
                >
                  {t('adminDefaultSettings.addModel')}
                </Button>
              </Flexbox>
            </Flexbox>
          </div>
        )}
    </Flexbox>
  );
});

ProvidersPanel.displayName = 'AdminDefaultSettingsProvidersPanel';

export default ProvidersPanel;
