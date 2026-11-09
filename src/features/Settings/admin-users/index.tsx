'use client';

import {
  Button,
  confirmModal,
  Flexbox,
  Icon,
  Input,
  Switch,
  Text,
  TextArea,
  toast,
} from '@lobehub/ui';
import { Form, useForm } from '@lobehub/ui/form';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Shield, UserRoundCog } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { adminService } from '@/services/admin';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';
import { sx } from '@/styles/sx';

import { canDeleteAdminUser } from './canDeleteAdminUser';
import {
  InvalidAdminUserJsonError,
  SelfBanNotAllowedError,
  submitAdminUserDetail,
} from './submitAdminUserDetail';

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
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR(isAdmin ? ['admin-users', query] : null, () =>
    adminService.listUsers({ limit: 100, query: query || undefined }),
  );

  const actorIsBootstrapAdmin = Boolean(
    currentUserId && data?.bootstrapAdminUserId === currentUserId,
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
                {user.isBootstrapAdmin && (
                  <span {...sx(styles.badge, styles.badgeAdmin)}>
                    <Icon icon={Shield} size={12} /> {t('adminUsers.badge.bootstrap')}
                  </span>
                )}
                {user.isSuperAdmin && !user.isBootstrapAdmin && (
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
            actorIsBootstrapAdmin={actorIsBootstrapAdmin}
            userId={selectedId}
            onClose={() => setSelectedId(null)}
            onDeleted={() => {
              setSelectedId(null);
              void mutate();
            }}
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
  actorIsBootstrapAdmin: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
  userId: string;
}

const AdminUserDetail = memo(
  ({ actorIsBootstrapAdmin, onClose, onDeleted, onSaved, userId }: AdminUserDetailProps) => {
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

    if (error || isLoading || !initialValues || !data) {
      return <Text type="secondary">{t('adminUsers.loading')}</Text>;
    }

    return (
      <AdminUserDetailForm
        actorIsBootstrapAdmin={actorIsBootstrapAdmin}
        initialValues={initialValues}
        saving={saving}
        setSaving={setSaving}
        targetIsBootstrapAdmin={data.user.isBootstrapAdmin}
        targetIsSuperAdmin={data.user.isSuperAdmin}
        userId={userId}
        onClose={onClose}
        onDeleted={onDeleted}
        onSaved={onSaved}
      />
    );
  },
);

interface AdminUserDetailFormProps {
  actorIsBootstrapAdmin: boolean;
  initialValues: AdminUserFormValues;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
  targetIsBootstrapAdmin: boolean;
  targetIsSuperAdmin: boolean;
  userId: string;
}

const resolveDeleteErrorMessage = (error: unknown, t: (key: any) => string) => {
  if (!(error instanceof Error)) return t('adminUsers.deleteFailed');
  if (/Cannot delete your own account/i.test(error.message)) return t('adminUsers.deleteSelfError');
  if (/Only the initial administrator can delete another system administrator/i.test(error.message)) {
    return t('adminUsers.deleteAdminForbidden');
  }
  if (/agent transfer is still pending/i.test(error.message)) {
    return t('adminUsers.deleteTransferPending');
  }
  return t('adminUsers.deleteFailed');
};

const AdminUserDetailForm = memo(
  ({
    actorIsBootstrapAdmin,
    initialValues,
    onClose,
    onDeleted,
    onSaved,
    saving,
    setSaving,
    targetIsBootstrapAdmin,
    targetIsSuperAdmin,
    userId,
  }: AdminUserDetailFormProps) => {
    const { t } = useTranslation('setting');
    const currentUserId = useUserStore(userProfileSelectors.userId);
    const isSelf = currentUserId === userId;
    const showDelete = canDeleteAdminUser({
      actorIsBootstrapAdmin,
      actorUserId: currentUserId,
      targetIsSuperAdmin,
      targetUserId: userId,
    });

    const handleFinish = async (values: AdminUserFormValues) => {
      setSaving(true);
      try {
        await submitAdminUserDetail(userId, values, currentUserId);
        toast.success(t('adminUsers.saveSuccess'));
        onSaved();
      } catch (error) {
        console.error(error);
        if (error instanceof InvalidAdminUserJsonError) {
          toast.error(t('adminUsers.invalidJson'));
          return;
        }
        if (error instanceof SelfBanNotAllowedError) {
          toast.error(t('adminUsers.selfBanError'));
          return;
        }
        const message =
          error instanceof Error && /last system administrator/i.test(error.message)
            ? t('adminUsers.lastAdminError')
            : error instanceof Error && /Cannot ban your own account/i.test(error.message)
              ? t('adminUsers.selfBanError')
              : t('adminUsers.saveFailed');
        toast.error(message);
      } finally {
        setSaving(false);
      }
    };

    const handleDelete = () => {
      confirmModal({
        cancelText: t('adminUsers.deleteConfirm.cancel'),
        content: t('adminUsers.deleteConfirm.content'),
        okButtonProps: { danger: true },
        okText: t('adminUsers.deleteConfirm.ok'),
        onOk: async () => {
          try {
            await adminService.deleteUser(userId);
            toast.success(t('adminUsers.deleteSuccess'));
            onDeleted();
          } catch (error) {
            console.error(error);
            toast.error(resolveDeleteErrorMessage(error, t));
            throw error;
          }
        },
        title: t('adminUsers.deleteConfirm.title'),
      });
    };

    const form = useForm<AdminUserFormValues>({
      initialValues,
      onSubmit: handleFinish,
      values: initialValues,
    });

    return (
      <Flexbox gap={16}>
        <Flexbox horizontal align="center" gap={8}>
          <Text strong>{t('adminUsers.detailTitle')}</Text>
          {targetIsBootstrapAdmin && (
            <span {...sx(styles.badge, styles.badgeAdmin)}>
              <Icon icon={Shield} size={12} /> {t('adminUsers.badge.bootstrap')}
            </span>
          )}
        </Flexbox>
        <Form form={form} gap={12} layout="vertical">
          <Form.Field label={t('adminUsers.fields.fullName')} name="fullName">
            <Input />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.username')} name="username">
            <Input />
          </Form.Field>
          <Form.Field
            extra={isSelf ? t('adminUsers.selfBanHint') : undefined}
            label={t('adminUsers.fields.banned')}
            name="banned"
            valueProp="checked"
          >
            <Switch disabled={isSelf} />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.banReason')} name="banReason">
            <Input disabled={isSelf} />
          </Form.Field>
          <Form.Field
            label={t('adminUsers.fields.isSuperAdmin')}
            name="isSuperAdmin"
            valueProp="checked"
          >
            <Switch disabled={targetIsBootstrapAdmin} />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.settingsJson')} name="settingsJson">
            <TextArea autoSize={{ maxRows: 18, minRows: 8 }} />
          </Form.Field>
          <Form.Field label={t('adminUsers.fields.preferenceJson')} name="preferenceJson">
            <TextArea autoSize={{ maxRows: 12, minRows: 4 }} />
          </Form.Field>
        </Form>
        <Flexbox horizontal gap={8} justify="space-between">
          {showDelete ? (
            <Button danger disabled={saving} onClick={handleDelete}>
              {t('adminUsers.delete')}
            </Button>
          ) : (
            <span />
          )}
          <Flexbox horizontal gap={8}>
            <Button onClick={onClose}>{t('adminUsers.cancel')}</Button>
            <Button loading={saving} type="primary" onClick={() => void form.submit()}>
              {t('adminUsers.save')}
            </Button>
          </Flexbox>
        </Flexbox>
      </Flexbox>
    );
  },
);

AdminUsers.displayName = 'AdminUsers';

export default AdminUsers;
