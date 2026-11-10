'use client';

import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';
import {
  Alert,
  Breadcrumb,
  Button,
  copyToClipboard,
  Flexbox,
  Icon,
  Switch,
  Text,
  toast,
} from '@lobehub/ui';
import { Form, type FormGroupItem, useForm } from '@lobehub/ui/form';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ChevronRight, InfoIcon, LinkIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import useSWR from 'swr';

import AsyncError from '@/components/AsyncError';
import Loading from '@/components/Loading/BrandTextLoading';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { FORM_STYLE } from '@/const/layoutTokens';
import NavHeader from '@/features/NavHeader';
import { useKnowledgeBaseItem } from '@/features/ResourceManager/hooks/useKnowledgeItem';
import PolicySelect from '@/features/ResourcePermission/PolicySelect';
import WideScreenContainer from '@/features/WideScreenContainer';
import { knowledgeBaseShareService } from '@/services/knowledgeBaseShare';

import AddShareUsersButton from './AddShareUsersButton';
import ShareCollaboratorList from './ShareCollaboratorList';
import { useShareAccessLevelOptions } from './useShareAccessLevelOptions';

const styles = stylex.create({
  body: {
    position: 'relative',
    overflowY: 'auto',
    display: 'flex',
  },
  rowIcon: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: '1em',
  },
});

/**
 * Personal-space knowledge-base sharing page — per-user grants, share-with-all,
 * and a reusable invite link. Workspace libraries keep using ResourceAccessPage.
 */
const PersonalLibraryShare = memo(() => {
  const { t } = useTranslation('file');
  const { id } = useParams<{ id: string }>();
  const {
    data: library,
    isLoading: libraryLoading,
    mutate: mutateLibrary,
  } = useKnowledgeBaseItem(id || '');
  // Form instance is only required by `<Form form={...} />`; controls are
  // value-driven from SWR (`checked={data?.shareWithAll}`), not field APIs.
  const form = useForm();

  const { data, error, isLoading, mutate } = useSWR(id ? ['knowledgeBaseShare', id] : null, () =>
    knowledgeBaseShareService.listGrants(id!),
  );

  const refreshShareAndLibrary = useCallback(async () => {
    await Promise.all([mutate(), mutateLibrary()]);
  }, [mutate, mutateLibrary]);

  const {
    data: invite,
    error: inviteError,
    isLoading: inviteLoading,
    mutate: mutateInvite,
  } = useSWR(id ? ['knowledgeBaseShareInvite', id] : null, () =>
    knowledgeBaseShareService.getInvite(id!),
  );

  const levelOptions = useShareAccessLevelOptions(data?.shareWithAllAccessLevel);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const [rotating, setRotating] = useState(false);

  const inviteUrl = useMemo(() => {
    if (!invite?.token || typeof window === 'undefined') return '';
    return `${window.location.origin}/resource/library/share/accept?token=${encodeURIComponent(invite.token)}`;
  }, [invite?.token]);

  const handleShareWithAll = useCallback(
    async (enabled: boolean, accessLevel?: KnowledgeBaseGrantAccessLevel) => {
      if (!id) return;
      setUpdatingAll(true);
      try {
        await knowledgeBaseShareService.setShareWithAll(
          id,
          enabled,
          accessLevel ?? data?.shareWithAllAccessLevel ?? 'view',
        );
        await refreshShareAndLibrary();
        toast.success(t(enabled ? 'library.share.allEnabled' : 'library.share.allDisabled'));
      } catch {
        toast.error(t('library.share.updateFailed'));
      } finally {
        setUpdatingAll(false);
      }
    },
    [data?.shareWithAllAccessLevel, id, refreshShareAndLibrary, t],
  );

  const handleShareWithAllLevel = useCallback(
    async (accessLevel: KnowledgeBaseGrantAccessLevel) => {
      if (!id || !data?.shareWithAll) return;
      setUpdatingAll(true);
      try {
        await knowledgeBaseShareService.setShareWithAll(id, true, accessLevel);
        await refreshShareAndLibrary();
        toast.success(t('library.share.accessLevelUpdated'));
      } catch {
        toast.error(t('library.share.updateFailed'));
      } finally {
        setUpdatingAll(false);
      }
    },
    [data?.shareWithAll, id, refreshShareAndLibrary, t],
  );

  const handleCopyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    setCopying(true);
    try {
      await copyToClipboard(inviteUrl);
      toast.success(t('library.share.inviteCopied'));
    } catch {
      toast.error(t('library.share.updateFailed'));
    } finally {
      setCopying(false);
    }
  }, [inviteUrl, t]);

  const handleRotateInvite = useCallback(async () => {
    if (!id) return;
    setRotating(true);
    try {
      await knowledgeBaseShareService.rotateInvite(id);
      await mutateInvite();
      toast.success(t('library.share.inviteRotated'));
    } catch {
      toast.error(t('library.share.updateFailed'));
    } finally {
      setRotating(false);
    }
  }, [id, mutateInvite, t]);

  if (!id) return null;
  if (libraryLoading) return <RouteLoading />;

  const accessGroup: FormGroupItem = {
    children: [
      {
        avatar: (
          <span {...stylex.props(styles.rowIcon)}>
            <Icon icon={UsersIcon} size={16} />
          </span>
        ),
        children: (
          <Flexbox horizontal align={'center'} gap={12}>
            {data?.shareWithAll ? (
              <div style={{ minWidth: 140, width: 180 }}>
                <PolicySelect
                  loading={updatingAll}
                  options={levelOptions}
                  value={data.shareWithAllAccessLevel ?? 'view'}
                  onChange={(level) => void handleShareWithAllLevel(level)}
                />
              </div>
            ) : null}
            <Switch
              checked={data?.shareWithAll}
              loading={updatingAll}
              onChange={(checked) => void handleShareWithAll(checked)}
            />
          </Flexbox>
        ),
        desc: t('library.share.allDesc'),
        label: t('library.share.allLabel'),
      },
    ],
    title: t('library.share.generalGroup'),
  };

  const inviteGroup: FormGroupItem = {
    children: [
      {
        avatar: (
          <span {...stylex.props(styles.rowIcon)}>
            <Icon icon={LinkIcon} size={16} />
          </span>
        ),
        children: (
          <Flexbox horizontal gap={8}>
            <Button loading={copying || inviteLoading} onClick={() => void handleCopyInvite()}>
              {t('library.share.copyInvite')}
            </Button>
            <Button loading={rotating} type={'text'} onClick={() => void handleRotateInvite()}>
              {t('library.share.rotateInvite')}
            </Button>
          </Flexbox>
        ),
        desc: t('library.share.inviteDesc'),
        label: t('library.share.inviteLabel'),
      },
    ],
    title: t('library.share.inviteGroup'),
  };

  const formGroups: FormGroupItem[] = [
    accessGroup,
    {
      children: (
        <ShareCollaboratorList
          collaborators={data?.collaborators ?? []}
          knowledgeBaseId={id}
          onChanged={() => void refreshShareAndLibrary()}
        />
      ),
      desc: t('library.share.collaboratorsDesc'),
      extra: (
        <AddShareUsersButton knowledgeBaseId={id} onAdded={() => void refreshShareAndLibrary()} />
      ),
      title: t('library.share.collaboratorsTitle'),
    },
    inviteGroup,
  ];

  return (
    <Flexbox height={'100%'} width={'100%'}>
      <NavHeader
        styles={{ left: { paddingInlineStart: 24 } }}
        left={
          <Breadcrumb
            separator={<Icon color={cssVar.colorTextSecondary} icon={ChevronRight} size={14} />}
            items={[
              ...(library?.name
                ? [
                    {
                      title: (
                        <Link to={`/resource/library/${id}`}>
                          <Text
                            ellipsis
                            as={'span'}
                            color={'inherit'}
                            style={{ maxWidth: 200 }}
                            weight={500}
                          >
                            {library.name}
                          </Text>
                        </Link>
                      ),
                    },
                  ]
                : []),
              {
                title: (
                  <Text as={'span'} color={'inherit'} weight={500}>
                    {t('library.share.pageTitle')}
                  </Text>
                ),
              },
            ]}
          />
        }
      />
      <Flexbox {...stylex.props(styles.body)} flex={1} width={'100%'}>
        <WideScreenContainer>
          <Flexbox gap={16} paddingBlock={16}>
            {(error || inviteError) && (
              <AsyncError
                error={error || inviteError}
                variant={'inline'}
                onRetry={() => {
                  void mutate();
                  void mutateInvite();
                }}
              />
            )}
            {isLoading ? (
              <Loading debugId="PersonalLibraryShare" />
            ) : (
              <>
                <Alert
                  icon={<Icon icon={InfoIcon} />}
                  style={{ width: '100%' }}
                  title={t('library.share.notice')}
                  type={'info'}
                />
                <Form form={form} items={formGroups} itemsType={'group'} {...FORM_STYLE} />
              </>
            )}
          </Flexbox>
        </WideScreenContainer>
      </Flexbox>
    </Flexbox>
  );
});

PersonalLibraryShare.displayName = 'PersonalLibraryShare';

export default PersonalLibraryShare;
