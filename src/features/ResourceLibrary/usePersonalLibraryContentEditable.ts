'use client';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { knowledgeBaseSelectors, useKnowledgeBaseStore } from '@/store/library';

import { canMutatePersonalLibraryContent } from './personalLibraryContentAccess';

/**
 * Whether the current user may mutate content in the active personal library.
 * Workspace mode stays permissive here (resource permissions gate separately).
 * Reads the already-hydrated library replica; the share page / library fetch
 * keep `accessLevel` current.
 */
export const usePersonalLibraryContentEditable = (knowledgeBaseId?: string | null): boolean => {
  const activeWorkspaceId = useActiveWorkspaceId();
  const storeLibraryId = useResourceManagerStore((s) => s.libraryId);
  const id = knowledgeBaseId ?? storeLibraryId;
  const accessLevel = useKnowledgeBaseStore((s) =>
    id ? knowledgeBaseSelectors.getKnowledgeBaseById(id)(s)?.accessLevel : undefined,
  );

  if (activeWorkspaceId || !id) return true;
  return canMutatePersonalLibraryContent(accessLevel);
};
