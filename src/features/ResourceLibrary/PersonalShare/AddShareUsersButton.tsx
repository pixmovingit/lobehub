'use client';

import type { KnowledgeBaseGrantAccessLevel, KnowledgeBaseShareableUser } from '@lobechat/types';
import {
  Button,
  createModal,
  Empty,
  Flexbox,
  Icon,
  SearchBar,
  Tag,
  Text,
  toast,
  useModalContext,
} from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { CheckIcon, PlusIcon, SearchXIcon, UsersIcon } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWRInfinite from 'swr/infinite';

import UserAvatar from '@/components/UserAvatar';
import PolicySelect from '@/features/ResourcePermission/PolicySelect';
import { knowledgeBaseShareService } from '@/services/knowledgeBaseShare';

import { useShareAccessLevelOptions } from './useShareAccessLevelOptions';

const PAGE_SIZE = 20;

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
  rowDisabled: {
    cursor: 'not-allowed',
    opacity: 0.55,
    backgroundColor: { 'default': 'transparent', ':hover': 'transparent' },
  },
  rowSelected: {
    backgroundColor: cssVar.colorFillQuaternary,
  },
  status: {
    paddingBlock: 12,
    paddingInline: 8,
    textAlign: 'center',
  },
});

interface AddShareUsersContentProps {
  /** User ids that already hold a personal-share grant — shown but not selectable. */
  existingUserIds: string[];
  knowledgeBaseId: string;
  onAdded: () => void;
}

const AddShareUsersContent = memo<AddShareUsersContentProps>(
  ({ existingUserIds, knowledgeBaseId, onAdded }) => {
    const { t } = useTranslation('file');
    const { close } = useModalContext();
    const levelOptions = useShareAccessLevelOptions();
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query.trim());
    const [selected, setSelected] = useState<string[]>([]);
    const [accessLevel, setAccessLevel] = useState<KnowledgeBaseGrantAccessLevel>('view');
    const [submitting, setSubmitting] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const existingSet = useMemo(() => new Set(existingUserIds), [existingUserIds]);

    const getKey = useCallback(
      (
        pageIndex: number,
        previousPage: {
          hasMore: boolean;
          items: KnowledgeBaseShareableUser[];
          nextOffset: number;
        } | null,
      ) => {
        if (previousPage && !previousPage.hasMore) return null;
        return [
          'kbShareSearchUsers',
          deferredQuery,
          previousPage?.nextOffset ?? pageIndex * PAGE_SIZE,
        ] as const;
      },
      [deferredQuery],
    );

    const { data, error, isLoading, isValidating, setSize, size } = useSWRInfinite(
      getKey,
      ([, q, offset]) =>
        knowledgeBaseShareService.searchUsers({
          limit: PAGE_SIZE,
          offset: offset as number,
          query: (q as string) || undefined,
        }),
      {
        revalidateFirstPage: true,
        revalidateOnFocus: false,
      },
    );

    const users = useMemo(() => data?.flatMap((page) => page.items) ?? [], [data]);
    const hasMore = Boolean(data?.at(-1)?.hasMore);
    const isLoadingInitial = isLoading && !data;
    const isLoadingMore = isValidating && size > 1;

    useEffect(() => {
      const root = listRef.current;
      const sentinel = sentinelRef.current;
      if (!root || !sentinel || !hasMore) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && hasMore && !isValidating) {
            void setSize((current) => current + 1);
          }
        },
        { root, rootMargin: '80px' },
      );
      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [hasMore, isValidating, setSize, users.length]);

    const toggle = useCallback(
      (userId: string) => {
        if (existingSet.has(userId)) return;
        setSelected((prev) =>
          prev.includes(userId)
            ? prev.filter((id) => id !== userId)
            : [...prev, userId].slice(0, 50),
        );
      },
      [existingSet],
    );

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
              placeholder={t('library.share.searchFilterPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <PolicySelect options={levelOptions} value={accessLevel} onChange={setAccessLevel} />
          </Flexbox>
        </div>
        <div ref={listRef} {...stylex.props(styles.list)}>
          {isLoadingInitial ? (
            <div {...stylex.props(styles.status)}>
              <Text type={'secondary'}>{t('library.share.loadingUsers')}</Text>
            </div>
          ) : error ? (
            <Empty
              description={t('library.share.updateFailed')}
              icon={SearchXIcon}
              style={{ marginBlock: 48 }}
            />
          ) : users.length === 0 ? (
            <Empty
              icon={deferredQuery ? SearchXIcon : UsersIcon}
              style={{ marginBlock: 48 }}
              description={
                deferredQuery ? t('library.share.noMatch') : t('library.share.emptyUsers')
              }
            />
          ) : (
            <>
              {users.map((user) => {
                const alreadyShared = existingSet.has(user.id);
                const selectedRow = !alreadyShared && selected.includes(user.id);
                const name = user.fullName || user.username || user.email || user.id;
                return (
                  <Flexbox
                    horizontal
                    align={'center'}
                    aria-disabled={alreadyShared}
                    gap={12}
                    key={user.id}
                    {...stylex.props(
                      styles.row,
                      alreadyShared && styles.rowDisabled,
                      selectedRow && styles.rowSelected,
                    )}
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
                    {alreadyShared ? (
                      <Tag size={'small'} style={{ flex: 'none', margin: 0 }}>
                        {t('library.share.alreadyShared')}
                      </Tag>
                    ) : selectedRow ? (
                      <Icon color={cssVar.colorPrimary} icon={CheckIcon} />
                    ) : null}
                  </Flexbox>
                );
              })}
              <div ref={sentinelRef} {...stylex.props(styles.status)}>
                {isLoadingMore ? (
                  <Text type={'secondary'}>{t('library.share.loadingMore')}</Text>
                ) : null}
              </div>
            </>
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
  },
);

AddShareUsersContent.displayName = 'AddShareUsersContent';

interface AddShareUsersButtonProps {
  existingUserIds?: string[];
  knowledgeBaseId: string;
  onAdded: () => void;
}

const AddShareUsersButton = memo<AddShareUsersButtonProps>(
  ({ existingUserIds = [], knowledgeBaseId, onAdded }) => {
    const { t } = useTranslation('file');

    const handleOpen = useCallback(() => {
      createModal({
        content: (
          <AddShareUsersContent
            existingUserIds={existingUserIds}
            knowledgeBaseId={knowledgeBaseId}
            onAdded={onAdded}
          />
        ),
        footer: null,
        maskClosable: true,
        styles: { content: { overflow: 'hidden', padding: 0 } },
        title: t('library.share.addTitle'),
        width: 'min(90vw, 520px)',
      });
    }, [existingUserIds, knowledgeBaseId, onAdded, t]);

    return (
      <Button icon={<Icon icon={PlusIcon} />} size={'small'} onClick={handleOpen}>
        {t('library.share.add')}
      </Button>
    );
  },
);

AddShareUsersButton.displayName = 'AddShareUsersButton';

export default AddShareUsersButton;
