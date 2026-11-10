import type { KnowledgeBaseGrantAccessLevel, KnowledgeBaseGrantSubjectType } from '@lobechat/types';
import { isNotNull, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { timestamps, timestamptz } from './_helpers';
import { knowledgeBases } from './file';
import { users } from './user';

/**
 * Personal-space knowledge-base access grants.
 *
 * Workspace Cloud collaboration stays on `resource_permissions`. This table
 * only covers personal libraries (`knowledge_bases.workspace_id IS NULL`):
 *
 * - `subject_type = 'user'` + `user_id` — one registered account.
 * - `subject_type = 'all'` + `user_id IS NULL` — every registered user on
 *   this instance.
 *
 * `access_level` is cumulative: `view` (browse + mount), `edit` (+ mutate
 * content), `delete` (+ remove files). Ownership / share-admin never moves.
 */
export const knowledgeBaseAccessGrants = pgTable(
  'knowledge_base_access_grants',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    knowledgeBaseId: text('knowledge_base_id')
      .references(() => knowledgeBases.id, { onDelete: 'cascade' })
      .notNull(),

    subjectType: text('subject_type').$type<KnowledgeBaseGrantSubjectType>().notNull(),

    /** Set only when `subjectType === 'user'`. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),

    accessLevel: text('access_level')
      .$type<KnowledgeBaseGrantAccessLevel>()
      .notNull()
      .default('view'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('knowledge_base_access_grants_kb_user_unique')
      .on(t.knowledgeBaseId, t.userId)
      .where(isNotNull(t.userId)),
    uniqueIndex('knowledge_base_access_grants_kb_all_unique')
      .on(t.knowledgeBaseId)
      .where(sql`${t.subjectType} = 'all' AND ${t.userId} IS NULL`),
    index('knowledge_base_access_grants_kb_id_idx').on(t.knowledgeBaseId),
    index('knowledge_base_access_grants_user_id_idx').on(t.userId),
    index('knowledge_base_access_grants_created_by_idx').on(t.createdBy),
    check(
      'knowledge_base_access_grants_subject_shape',
      sql`(${t.subjectType} = 'user' AND ${t.userId} IS NOT NULL) OR (${t.subjectType} = 'all' AND ${t.userId} IS NULL)`,
    ),
  ],
);

export type NewKnowledgeBaseAccessGrant = typeof knowledgeBaseAccessGrants.$inferInsert;
export type KnowledgeBaseAccessGrantItem = typeof knowledgeBaseAccessGrants.$inferSelect;

/**
 * Reusable invite links for a personal knowledge base. Accepting the token
 * (while logged in) upserts a `subject_type='user'` grant for the caller and
 * does not consume the link.
 */
export const knowledgeBaseShareInvites = pgTable(
  'knowledge_base_share_invites',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(16)())
      .primaryKey()
      .notNull(),

    knowledgeBaseId: text('knowledge_base_id')
      .references(() => knowledgeBases.id, { onDelete: 'cascade' })
      .notNull(),

    token: text('token')
      .$defaultFn(() => createNanoId(24)())
      .notNull(),

    createdBy: text('created_by')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    /** `null` means the invite never expires. */
    expiresAt: timestamptz('expires_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('knowledge_base_share_invites_token_unique').on(t.token),
    // One active reusable invite row per knowledge base — rotate replaces it.
    uniqueIndex('knowledge_base_share_invites_kb_unique').on(t.knowledgeBaseId),
    index('knowledge_base_share_invites_kb_id_idx').on(t.knowledgeBaseId),
    index('knowledge_base_share_invites_created_by_idx').on(t.createdBy),
  ],
);

export type NewKnowledgeBaseShareInvite = typeof knowledgeBaseShareInvites.$inferInsert;
export type KnowledgeBaseShareInviteItem = typeof knowledgeBaseShareInvites.$inferSelect;
