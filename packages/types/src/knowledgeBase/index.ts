import type { FilesConfigItem } from '../user/settings/filesConfig';
import type { KnowledgeBaseGrantAccessLevel, KnowledgeBasePersonalAccessType } from './share';

export * from './share';

export enum KnowledgeBaseTabs {
  Files = 'files',
  Settings = 'Settings',
  Testing = 'testing',
}

export interface KnowledgeBaseOwner {
  avatar?: string | null;
  fullName?: string | null;
  id: string;
  username?: string | null;
}

export interface KnowledgeBaseItem {
  /**
   * Effective personal-share level for the caller.
   * Owners are `'owner'`; grantees get `view` / `edit` / `delete` / `full`
   * (`full` also manages sharing). Workspace listings keep using
   * `memberRestricted` / resource permissions.
   */
  accessLevel?: KnowledgeBaseGrantAccessLevel | 'owner';
  /**
   * Personal-space grant kind when the caller is not the owner.
   * Workspace listings keep using `memberRestricted` / resource permissions.
   */
  accessType?: KnowledgeBasePersonalAccessType;
  avatar: string | null;

  createdAt: Date;
  description?: string | null;
  enabled?: boolean;

  id: string;

  isPublic: boolean | null;
  /**
   * Whether others can reach this library: any personal-share grant, or
   * workspace `visibility === 'public'`. Used for the hero "私有 / 共享" chip.
   */
  isShared?: boolean;

  name: string;

  /** Creator profile for the library hero meta row. */
  owner?: KnowledgeBaseOwner;

  settings: any;
  // different types of knowledge bases need to be distinguished
  type: string | null;
  updatedAt: Date;
  /** Creator's user id — surfaced so the sidebar can gate creator-only actions. */
  userId?: string;
  /** Workspace-scoped visibility: `public` (default) or `private` (creator-only). */
  visibility?: 'private' | 'public';
}

/** An agent's dedicated knowledge base, identified to the user by its agent. */
export interface AgentKnowledgeSpaceItem {
  agentId: string;
  avatar: string | null;
  backgroundColor: string | null;
  description: string | null;
  /** The knowledge base id. */
  id: string;
  title: string | null;
}

export interface CreateKnowledgeBaseParams {
  avatar?: string;
  /** Cover image: a preset key (`preset:<id>`) or an uploaded image URL. */
  cover?: string;
  description?: string;
  name: string;
  /** Workspace-scoped visibility for a newly created KB. Derived from the current resource-mode. */
  visibility?: 'private' | 'public';
}

export enum KnowledgeType {
  File = 'file',
  KnowledgeBase = 'knowledgeBase',
}

export interface KnowledgeItem {
  avatar?: string | null;
  content?: string;
  description?: string | null;
  enabled?: boolean;
  fileType?: string;
  id: string;
  /**
   * KB only: carries a `use`-level (No-access) resource-permission row, so
   * plain members cannot see or open it. The picker badges the icon with a
   * lock for managers.
   */
  memberRestricted?: boolean;
  name: string;
  /** Creator's user id — used by the picker to gate creator-only actions and identify ownership. */
  ownerUserId?: string;
  type: KnowledgeType;
  /** Workspace-scoped visibility of the underlying resource (file or KB). */
  visibility?: 'private' | 'public';
}

export interface SystemEmbeddingConfig {
  embeddingModel: FilesConfigItem;
  queryMode: string;
  rerankerModel: FilesConfigItem;
}
