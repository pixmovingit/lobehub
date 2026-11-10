/**
 * Personal-space knowledge-base access grant subjects.
 * - `user` — one registered account (`userId` set)
 * - `all` — every registered user on this instance (`userId` null)
 */
export const KNOWLEDGE_BASE_GRANT_SUBJECT_TYPES = ['user', 'all'] as const;
export type KnowledgeBaseGrantSubjectType = (typeof KNOWLEDGE_BASE_GRANT_SUBJECT_TYPES)[number];

/**
 * Cumulative personal-share permissions (never ownership transfer):
 * - `view` — browse files and mount in AI chat (default)
 * - `edit` — view + add / update content in the library
 * - `delete` — legacy: edit + remove files (no longer offered in the share UI;
 *   new grants that need removal should use `full`)
 * - `full` — delete + update library metadata + manage sharing (collaborators / invites)
 */
export const KNOWLEDGE_BASE_GRANT_ACCESS_LEVELS = ['view', 'edit', 'delete', 'full'] as const;
export type KnowledgeBaseGrantAccessLevel = (typeof KNOWLEDGE_BASE_GRANT_ACCESS_LEVELS)[number];

export const KNOWLEDGE_BASE_GRANT_ACCESS_RANK: Record<KnowledgeBaseGrantAccessLevel, number> = {
  delete: 3,
  edit: 2,
  full: 4,
  view: 1,
};

export const DEFAULT_KNOWLEDGE_BASE_GRANT_ACCESS_LEVEL: KnowledgeBaseGrantAccessLevel = 'view';

export const knowledgeBaseGrantAccessAtLeast = (
  actual: KnowledgeBaseGrantAccessLevel,
  required: KnowledgeBaseGrantAccessLevel,
): boolean =>
  KNOWLEDGE_BASE_GRANT_ACCESS_RANK[actual] >= KNOWLEDGE_BASE_GRANT_ACCESS_RANK[required];

/**
 * How the caller reached a personal knowledge base.
 * Workspace Cloud resource-permissions stay separate; these values are for
 * personal-space grants only (plus OpenAPI listing).
 */
export type KnowledgeBasePersonalAccessType = 'owner' | 'userGrant' | 'public';

export interface KnowledgeBaseAccessGrantItem {
  accessLevel: KnowledgeBaseGrantAccessLevel;
  createdAt: Date;
  id: string;
  knowledgeBaseId: string;
  subjectType: KnowledgeBaseGrantSubjectType;
  /** Present when `subjectType === 'user'`. */
  userId: string | null;
}

export interface KnowledgeBaseShareInviteItem {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  knowledgeBaseId: string;
  token: string;
}

export interface KnowledgeBaseShareableUser {
  avatar?: string | null;
  email?: string | null;
  fullName?: string | null;
  id: string;
  username?: string | null;
}
