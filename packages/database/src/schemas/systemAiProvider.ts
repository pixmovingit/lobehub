import type { AiProviderConfig, AiProviderSettings } from '@lobechat/types';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { AiModelSettings } from 'model-bank';

import { timestamps } from './_helpers';

/**
 * Deployment-wide default AI providers. Distinct from `ai_providers` (per-user /
 * per-workspace): rows here are merged into every user's provider list the same
 * way builtin cards are — one catalog, no per-user clone.
 *
 * `keyVaults` is AES-GCM encrypted JSON via `KeyVaultsGateKeeper` (same shape as
 * user custom providers: `{ apiKey?, baseURL?, ... }`).
 */
export const systemAiProviders = pgTable(
  'system_ai_providers',
  {
    id: varchar('id', { length: 64 }).primaryKey().notNull(),

    name: text('name').notNull(),
    description: text('description'),
    logo: text('logo'),

    enabled: boolean('enabled').default(true).notNull(),
    sort: integer('sort'),
    checkModel: text('check_model'),
    fetchOnClient: boolean('fetch_on_client'),

    /** AES-GCM encrypted key vaults JSON. */
    keyVaults: text('key_vaults'),

    settings: jsonb('settings')
      .$defaultFn(() => ({}))
      .$type<AiProviderSettings>()
      .notNull(),

    config: jsonb('config')
      .$defaultFn(() => ({}))
      .$type<AiProviderConfig>()
      .notNull(),

    ...timestamps,
  },
  (table) => [index('system_ai_providers_enabled_idx').on(table.enabled)],
);

export type NewSystemAiProvider = typeof systemAiProviders.$inferInsert;
export type SystemAiProviderItem = typeof systemAiProviders.$inferSelect;

/**
 * Models belonging to a system default provider. No `userId` — every user sees
 * the same catalog, with personal `ai_models` rows able to override by id.
 */
export const systemAiModels = pgTable(
  'system_ai_models',
  {
    id: varchar('id', { length: 150 }).notNull(),

    _id: uuid('_id').defaultRandom().notNull().primaryKey(),

    displayName: varchar('display_name', { length: 200 }),
    description: text('description'),
    organization: varchar('organization', { length: 100 }),
    enabled: boolean('enabled').default(true).notNull(),
    providerId: varchar('provider_id', { length: 64 })
      .references(() => systemAiProviders.id, { onDelete: 'cascade' })
      .notNull(),
    type: varchar('type', { length: 20 }).default('chat').notNull(),
    sort: integer('sort'),

    pricing: jsonb('pricing'),
    parameters: jsonb('parameters').default({}),
    config: jsonb('config'),
    abilities: jsonb('abilities').default({}),
    contextWindowTokens: integer('context_window_tokens'),
    releasedAt: varchar('released_at', { length: 10 }),
    settings: jsonb('settings').default({}).$type<AiModelSettings>(),

    ...timestamps,
  },
  (table) => [
    uniqueIndex('system_ai_models_id_provider_id_unique').on(table.id, table.providerId),
    index('system_ai_models_provider_id_idx').on(table.providerId),
  ],
);

export type NewSystemAiModel = typeof systemAiModels.$inferInsert;
export type SystemAiModelItem = typeof systemAiModels.$inferSelect;
