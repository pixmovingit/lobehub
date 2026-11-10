'use client';

import { Button } from '@lobehub/ui';
import { Share2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useKnowledgeBaseItem } from '@/features/ResourceManager/hooks/useKnowledgeItem';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useResourceManageable } from '@/hooks/useResourceManageable';
import { knowledgeBaseSelectors, useKnowledgeBaseStore } from '@/store/library';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { resolveLibraryShareEntry } from './resolveLibraryShareEntry';

/**
 * Explorer-header Share control. Sits beside Add so share settings stay one
 * click away while browsing a library (the card menu still exposes the same
 * destination).
 */
export const LibraryShareButton = memo(() => {
  const { t } = useTranslation(['file', 'setting']);
  const navigate = useWorkspaceAwareNavigate();
  const isMobile = useIsMobile();
  const activeWorkspaceId = useActiveWorkspaceId();
  const libraryId = useResourceManagerStore((s) => s.libraryId);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { data: library } = useKnowledgeBaseItem(libraryId || '');
  const libraries = useKnowledgeBaseStore(knowledgeBaseSelectors.getKnowledgeBaseList());
  const creatorManageable = useResourceManageable(library?.userId);

  const listPermissionManageable = useMemo(() => {
    if (!libraryId || !libraries) return undefined;
    const row = libraries.find((item) => item.id === libraryId) as
      (NonNullable<typeof libraries>[number] & { permissionManageable?: boolean }) | undefined;
    return row?.permissionManageable;
  }, [libraries, libraryId]);

  const entry = resolveLibraryShareEntry({
    accessLevel: library?.accessLevel,
    activeWorkspaceId,
    currentUserId,
    libraryId,
    libraryUserId: library?.userId,
    permissionManageable:
      listPermissionManageable ?? (activeWorkspaceId ? creatorManageable : undefined),
  });

  if (!entry) return null;

  const label =
    entry.kind === 'workspace'
      ? t('permission.page.entry', { ns: 'setting' })
      : t('library.share.menuEntry');

  return (
    <Button
      data-no-highlight
      aria-label={label}
      icon={Share2}
      title={isMobile ? label : undefined}
      onClick={() => navigate(entry.href)}
    >
      {isMobile ? undefined : label}
    </Button>
  );
});

LibraryShareButton.displayName = 'LibraryShareButton';
