'use client';

import { Flexbox, Tag, Text } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import LibraryStatusIcon from '@/components/LibIcon/StatusIcon';
import UserAvatar from '@/components/UserAvatar';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import type { KnowledgeBaseItem } from '@/types/knowledgeBase';

import { resolveLibraryOwnerName, resolveLibrarySharingState } from './libraryHeroMeta';

const styles = stylex.create({
  description: {
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    maxWidth: '720px',
    fontSize: '13px',
    lineHeight: '20px',
    color: cssVar.colorTextSecondary,
  },
  meta: {
    fontSize: '13px',
    lineHeight: '20px',
    color: cssVar.colorTextSecondary,
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 600,
    color: cssVar.colorText,
  },
});

interface LibraryHeroProps {
  library: KnowledgeBaseItem;
}

/**
 * The top of a knowledge base's root view: its name, creator, sharing state,
 * and description. The cover belongs to the gallery card; it is changed from
 * the edit form, not here.
 */
const LibraryHero = memo<LibraryHeroProps>(({ library }) => {
  const { t } = useTranslation('file');
  const activeWorkspaceId = useActiveWorkspaceId();
  const currentUserId = useUserStore(userProfileSelectors.userId);

  const ownerName = resolveLibraryOwnerName(library, currentUserId, t('docs.library.owner.you'));
  const { isShared, statusVisibility, tagColor } = resolveLibrarySharingState({
    activeWorkspaceId,
    isShared: library.isShared,
    visibility: library.visibility,
  });
  const sharingLabel = isShared
    ? activeWorkspaceId
      ? t('docs.library.sharing.workspace')
      : t('docs.library.sharing.shared')
    : t('docs.library.sharing.private');

  return (
    <Flexbox flex={'none'} gap={6} paddingBlock={20} paddingInline={24}>
      <Flexbox horizontal align={'center'} gap={8}>
        <LibraryStatusIcon
          memberRestricted={(library as { memberRestricted?: boolean }).memberRestricted}
          size={20}
          visibility={statusVisibility}
        />
        <h1 {...stylex.props(styles.title)}>{library.name}</h1>
      </Flexbox>
      {(ownerName || library.owner) && (
        <Flexbox horizontal align={'center'} gap={8}>
          <UserAvatar avatar={library.owner?.avatar || undefined} name={ownerName} size={20} />
          <span {...stylex.props(styles.meta)}>
            {t('docs.library.owner.createdBy', { name: ownerName || library.owner?.id })}
          </span>
          <Tag color={tagColor} size={'small'}>
            {sharingLabel}
          </Tag>
        </Flexbox>
      )}
      {library.description ? (
        <div {...stylex.props(styles.description)}>{library.description}</div>
      ) : (
        <Text fontSize={13} type={'secondary'}>
          {t('docs.library.noDescription')}
        </Text>
      )}
    </Flexbox>
  );
});

LibraryHero.displayName = 'LibraryHero';

export default LibraryHero;
