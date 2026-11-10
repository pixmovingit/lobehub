'use client';

import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';
import {
  Button,
  createModal,
  Empty,
  Flexbox,
  Icon,
  SearchBar,
  Text,
  toast,
  useModalContext,
} from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { CheckIcon, PlusIcon, SearchXIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import UserAvatar from '@/components/UserAvatar';
import PolicySelect from '@/features/ResourcePermission/PolicySelect';
import { knowledgeBaseShareService } from '@/services/knowledgeBaseShare';

import { useShareAccessLevelOptions } from './useShareAccessLevelOptions';

const styles = stylex.create({
  footer: {
    paddingBlock: 12,
    paddingInline: 20,
    borderBlockStartWidth: 1,
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: cssVar.colorBorderSecondary,
  },
  header: {
    paddingBlockStart: 4,
    paddingBlockEnd: 12,
    paddingInline: 20,
  },
  list: {
    overflowY: 'auto',
    height: 'clamp(240px, calc(100dvh - 320px), 360px)',
    paddingBlockStart: 0,
    paddingBlockEnd: 8,
    paddingInline: 12,
  },
  row: {
    cursor: 'pointer',
    marginBlock: 2,
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: cssVar.borderRadius,
    backgroundColor: { 'default': 'transparent', ':hover': cssVar.colorFillTertiary },
    transitionProperty: 'background-color',
    transitionDuration: '0.2s',
  },
  rowSelected: {
    backgroundColor: cssVar.colorFillQuaternary,
  },
});

interface AddShareUsersContentProps {
  knowledgeBaseId: string;
  onAdded: () => void;
}

const AddShareUsersContent = memo<AddShareUsersContentProps>(({ knowledgeBaseId, onAdded }) => {
  const { t } = useTranslation('file');
  const { close } = useModalContext();
  const levelOptions = useShareAccessLevelOptions();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [selected, setSelected] = useState<string[]>([]);
  const [accessLevel, setAccessLevel] = useState<KnowledgeBaseGrantAccessLevel>('view');
  const [submitting, setSubmitting] = useState(false);

  const { data: users = [], isLoading } = useSWR(
    deferredQuery.length >= 2 ? ['kbShareSearchUsers', deferredQuery] : null,
    () => knowledgeBaseShareService.searchUsers(deferredQuery),
  );

  const toggle = useCallback((userId: string) => {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId].slice(0, 50),
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await knowledgeBaseShareService.addUsers(knowledgeBaseId, selected, accessLevel);
      onAdded();
      toast.success(t('library.share.addSuccess'));
      close();
    } catch {
      toast.error(t('library.share.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [accessLevel, close, knowledgeBaseId, onAdded, selected, t]);

  return (
    <Flexbox>
      <div {...stylex.props(styles.header)}>
        <Flexbox gap={12}>
          <SearchBar
            allowClear
            placeholder={t('library.share.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <PolicySelect options={levelOptions} value={accessLevel} onChange={setAccessLevel} />
        </Flexbox>
      </div>
      <div {...stylex.props(styles.list)}>
        {deferredQuery.length < 2 ? (
          <Empty
            description={t('library.share.searchHint')}
            icon={UsersIcon}
            style={{ marginBlock: 48 }}
          />
        ) : isLoading ? (
          <Text type={'secondary'}>{t('library.share.searching')}</Text>
        ) : users.length === 0 ? (
          <Empty
            description={t('library.share.noMatch')}
            icon={SearchXIcon}
            style={{ marginBlock: 48 }}
          />
        ) : (
          users.map((user) => {
            const selectedRow = selected.includes(user.id);
            const name = user.fullName || user.username || user.email || user.id;
            return (
              <Flexbox
                horizontal
                align={'center'}
                gap={12}
                key={user.id}
                {...stylex.props(styles.row, selectedRow && styles.rowSelected)}
                onClick={() => toggle(user.id)}
              >
                <UserAvatar avatar={user.avatar || undefined} size={28} />
                <Flexbox gap={2} style={{ minWidth: 0 }}>
                  <Text ellipsis weight={500}>
                    {name}
                  </Text>
                  {user.email ? (
                    <Text ellipsis fontSize={12} type={'secondary'}>
                      {user.email}
                    </Text>
                  ) : null}
                </Flexbox>
                {selectedRow ? <Icon color={cssVar.colorPrimary} icon={CheckIcon} /> : null}
              </Flexbox>
            );
          })
        )}
      </div>
      <Flexbox {...stylex.props(styles.footer)} horizontal justify={'space-between'}>
        <Text type={'secondary'}>
          {t('library.share.selectedCount', { count: selected.length })}
        </Text>
        <Button
          disabled={selected.length === 0}
          loading={submitting}
          type={'primary'}
          onClick={() => void handleConfirm()}
        >
          {t('library.share.addConfirm', { count: selected.length })}
        </Button>
      </Flexbox>
    </Flexbox>
  );
});

AddShareUsersContent.displayName = 'AddShareUsersContent';

interface AddShareUsersButtonProps {
  knowledgeBaseId: string;
  onAdded: () => void;
}

const AddShareUsersButton = memo<AddShareUsersButtonProps>(({ knowledgeBaseId, onAdded }) => {
  const { t } = useTranslation('file');

  const handleOpen = useCallback(() => {
    createModal({
      content: <AddShareUsersContent knowledgeBaseId={knowledgeBaseId} onAdded={onAdded} />,
      footer: null,
      maskClosable: true,
      styles: { content: { overflow: 'hidden', padding: 0 } },
      title: t('library.share.addTitle'),
      width: 'min(90vw, 520px)',
    });
  }, [knowledgeBaseId, onAdded, t]);

  return (
    <Button icon={<Icon icon={PlusIcon} />} size={'small'} onClick={handleOpen}>
      {t('library.share.add')}
    </Button>
  );
});

AddShareUsersButton.displayName = 'AddShareUsersButton';

export default AddShareUsersButton;
