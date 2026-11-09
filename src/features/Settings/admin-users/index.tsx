'use client';

import { Button, Flexbox, Icon, Input, Switch, Text, TextArea, toast } from '@lobehub/ui';
import { Form, useForm } from '@lobehub/ui/form';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Shield, UserRoundCog } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { adminService } from '@/services/admin';
import { useUserStore } from '@/store/user';
import { sx } from '@/styles/sx';

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
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    backgroundColor: cssVar.colorFillSecondary,
    borderRadius: cssVar.borderRadiusSM,
    fontSize: 12,
    paddingBlock: 2,
    paddingInline: 8,
  },
  badgeDanger: {
    backgroundColor: cssVar.colorErrorBg,
    color: cssVar.colorError,
  },
  badgeAdmin: {
    backgroundColor: cssVar.colorInfoBg,
    color: cssVar.colorInfo,
  },
  detail: {
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: cssVar.borderRadiusLG,
    borderStyle: 'solid',
    borderWidth: 1,
    padding: 16,
  },
});

interface AdminUserFormValues {
  banned: boolean;
  banReason: string;
  fullName: string;
  isSuperAdmin: boolean;
  preferenceJson: string;
  settingsJson: string;
  username: string;
}

const AdminUsers = memo(() => {
  const { t } = useTranslation('setting');
  const isAdmin = useUserStore((s) => Boolean(s.userState?.isAdmin));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR(isAdmin ? ['admin-users', query] : null, () =>
    adminService.listUsers({ limit: 100, query: query || undefined }),
  );

  if (!isAdmin) {
    return (
      <Flexbox gap={8} padding={24}>
        <Text type="secondary">{t('adminUsers.forbidden')}</Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={24} width="100%">
      <Text type="secondary">{t('adminUsers.desc')}</Text>

      <Flexbox gap={12}>
        <Input
          allowClear
          placeholder={t('adminUsers.searchPlaceholder')}
          prefix={<Icon icon={UserRoundCog} />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {isLoading && <Text type="secondary">{t('adminUsers.loading')}</Text>}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <Text type="secondary">{t('adminUsers.empty')}</Text>
        )}
        <div {...sx(styles.list)}>
          {data?.items.map((user) => (
            <button
              {...sx(styles.row, selectedId === user.id && styles.rowActive)}
              key={user.id}
              type="button"
              onClick={() => setSelectedId(user.id)}
            >
              <div {...sx(styles.meta)}>
                <Text ellipsis strong>
                  {user.fullName || user.username || user.email || user.id}
                </Text>
                <Text ellipsis fontSize={12} type="secondary">
                  {user.email || user.id}
                </Text>
              </div>
              <div {...sx(styles.badges)}>
                {user.isSuperAdmin && (
                  <span {...sx(styles.badge, styles.badgeAdmin)}>
                    <Icon icon={Shield} size={12} /> {t('adminUsers.badge.admin')}
                  </span>
                )}
                {user.banned && (
                  <span {...sx(styles.badge, styles.badgeDanger)}>
                    {t('adminUsers.badge.banned')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </Flexbox>

      {selectedId && (
        <div {...sx(styles.detail)}>
          <AdminUserDetail
            key={selectedId}
            userId={selectedId}
            onClose={() => setSelectedId(null)}
            onSaved={() => {
              void mutate();
            }}
          />
        </div>
      )}
    </Flexbox>
  );
});

interface AdminUserDetailProps {
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}

const AdminUserDetail = memo(({ onClose, onSaved, userId }: AdminUserDetailProps) => {
  const { t } = useTranslation('setting');
  const [saving, setSaving] = useState(false);

  const { data, error, isLoading } = useSWR(
    ['admin-user-detail', userId],
    async () => {
      const [user, settingsPayload] = await Promise.all([
        adminService.getUser(userId),
        adminService.getUserSettings(userId),
      ]);
      return { settingsPayload, user };
    },
    {
      onError: (err) => {
        console.error(err);
        toast.error(t('adminUsers.loadFailed'));
        onClose();
      },
    },
  );

  const initialValues = useMemo<AdminUserFormValues | null>(() => {
    if (!data) return null;
    return {
      banReason: data.user.banReason || '',
      banned: Boolean(data.user.banned),
      fullName: data.user.fullName || '',
      isSuperAdmin: data.user.isSuperAdmin,
      preferenceJson: JSON.stringify(data.settingsPayload.preference ?? {}, null, 2),
      settingsJson: JSON.stringify(data.settingsPayload.settings ?? {}, null, 2),
      username: data.user.username || '',
    };
  }, [data]);

  if (error || isLoading || !initialValues) {
    return <Text type="secondary">{t('adminUsers.loading')}</Text>;
  }

  return (
    <AdminUserDetailForm
      initialValues={initialValues}
      saving={saving}
      setSaving={setSaving}
      userId={userId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
});

interface AdminUserDetailFormProps {
  initialValues: AdminUserFormValues;
  onClose: () => void;
  onSaved: () => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
  userId: string;
}

const AdminUserDetailForm = memo(
  ({ initialValues, onClose, onSaved, saving, setSaving, userId }: AdminUserDetailFormProps) => {
    const { t } = useTranslation('setting');
    const form = useForm<AdminUserFormValues>({
      initialValues,
      values: initialValues,
    });

    const handleSave = form.handleSubmit(async (values) => {
      setSaving(true);
      try {
        let settings: Record<string, unknown>;
        let preference: Record<string, unknown>;
        try {
          settings = JSON.parse(values.settingsJson) as Record<string, unknown>;
          preference = JSON.parse(values.preferenceJson) as Record<string, unknown>;
        } catch {
          toast.error(t('adminUsers.invalidJson'));
          setSaving(false);
          return;
        }

        await adminService.updateUser({
          banReason: values.banned ? values.banReason || null : null,
          banned: values.banned,
          fullName: values.fullName || null,
          userId,
          username: values.username || null,
        });
        await adminService.setSuperAdmin(userId, values.isSuperAdmin);
        await adminService.updateUserSettings({
          preference: preference as never,
          settings: settings as never,
          userId,
        });
        toast.success(t('adminUsers.saveSuccess'));
        onSaved();
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error && /last system administrator/i.test(error.message)
            ? t('adminUsers.lastAdminError')
            : t('adminUsers.saveFailed');
        toast.error(message);
      } finally {
        setSaving(false);
      }
    });

    return (
      <Flexbox gap={16}>
        <Text strong>{t('adminUsers.detailTitle')}</Text>
        <Form form={form} gap={12} layout="vertical">
          <Form.Field label={t('adminUsers.fields.fullName')} name="fullName">
            <Input />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.username')} name="username">
            <Input />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.banned')} name="banned" valuePropName="checked">
            <Switch />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.banReason')} name="banReason">
            <Input />
          </Form.Field>
          <Form.Field
            label={t('adminUsers.fields.isSuperAdmin')}
            name="isSuperAdmin"
            valuePropName="checked"
          >
            <Switch />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.settingsJson')} name="settingsJson">
            <TextArea autoSize={{ maxRows: 18, minRows: 8 }} />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.preferenceJson')} name="preferenceJson">
            <TextArea autoSize={{ maxRows: 12, minRows: 4 }} />
          </Form.Field>
        </Form>
        <Flexbox horizontal gap={8} justify="flex-end">
          <Button onClick={onClose}>{t('adminUsers.cancel')}</Button>
          <Button loading={saving} type="primary" onClick={() => void handleSave()}>
            {t('adminUsers.save')}
          </Button>
        </Flexbox>
      </Flexbox>
    );
  },
);

AdminUsers.displayName = 'AdminUsers';

export default AdminUsers;
