import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';
import { knowledgeBaseGrantAccessAtLeast } from '@lobechat/types';

/**
 * Whether the caller's personal-share grade may mutate library content.
 * Owners and missing grades (own library / still loading) stay editable; a
 * resolved `view` grant is read-only.
 */
export const canMutatePersonalLibraryContent = (
  accessLevel: KnowledgeBaseGrantAccessLevel | 'owner' | null | undefined,
): boolean => {
  if (!accessLevel || accessLevel === 'owner') return true;
  return knowledgeBaseGrantAccessAtLeast(accessLevel, 'edit');
};
