import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';

export type LibraryShareEntry = {
  href: string;
  kind: 'personal' | 'workspace';
};

/**
 * Where the explorer-header Share button should go, if the caller may manage
 * sharing for this library. Mirrors the library-card dropdown: workspace KBs
 * open member permissions; personal KBs open the OSS share page for the
 * owner or a `full` grantee.
 */
export const resolveLibraryShareEntry = ({
  accessLevel,
  activeWorkspaceId,
  currentUserId,
  libraryId,
  libraryUserId,
  permissionManageable,
}: {
  accessLevel?: KnowledgeBaseGrantAccessLevel | 'owner';
  activeWorkspaceId?: string | null;
  currentUserId?: string | null;
  libraryId?: string | null;
  libraryUserId?: string | null;
  permissionManageable?: boolean;
}): LibraryShareEntry | null => {
  if (!libraryId) return null;

  if (activeWorkspaceId) {
    if (!permissionManageable) return null;
    return {
      href: `/resource/library/${libraryId}/permission`,
      kind: 'workspace',
    };
  }

  const isOwner = !!currentUserId && !!libraryUserId && currentUserId === libraryUserId;
  const canManagePersonalShare = isOwner || accessLevel === 'owner' || accessLevel === 'full';
  if (!canManagePersonalShare) return null;

  return {
    href: `/resource/library/${libraryId}/share`,
    kind: 'personal',
  };
};
