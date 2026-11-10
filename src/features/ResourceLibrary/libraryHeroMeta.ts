import type { KnowledgeBaseItem } from '@/types/knowledgeBase';

/** Preset Tag colors for private / personal-shared / workspace-shared libraries. */
export type LibrarySharingTagColor = 'blue' | 'cyan' | 'default';

export const resolveLibraryOwnerName = (
  library: Pick<KnowledgeBaseItem, 'owner' | 'userId'>,
  currentUserId: string | undefined,
  youLabel: string,
): string | null => {
  if (library.userId && currentUserId && library.userId === currentUserId) return youLabel;
  return library.owner?.fullName || library.owner?.username || null;
};

export const resolveLibrarySharingState = ({
  activeWorkspaceId,
  isShared,
  visibility,
}: {
  activeWorkspaceId?: string | null;
  isShared?: boolean;
  visibility?: 'private' | 'public' | null;
}): {
  isShared: boolean;
  statusVisibility: 'private' | 'public';
  tagColor: LibrarySharingTagColor;
} => {
  if (activeWorkspaceId) {
    const shared = visibility === 'public';
    return {
      isShared: shared,
      statusVisibility: shared ? 'public' : 'private',
      // Workspace-public reads as "workspace shared"; keep cyan distinct from
      // personal blue so the same gallery can mix modes without ambiguity.
      tagColor: shared ? 'cyan' : 'default',
    };
  }

  const shared = Boolean(isShared);
  return {
    isShared: shared,
    statusVisibility: shared ? 'public' : 'private',
    tagColor: shared ? 'blue' : 'default',
  };
};
