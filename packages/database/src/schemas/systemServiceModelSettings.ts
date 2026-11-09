import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';

/**
 * Singleton deployment-wide Service Model defaults for **new registrations**.
 *
 * Copied into a brand-new account's `user_settings` during `UserService.initUser`.
 * Existing accounts are never rewritten when an admin changes this row.
 */
export const systemServiceModelSettings = pgTable('system_service_model_settings', {
  /** Singleton key — only the `default` row is used. */
  id: text('id').primaryKey().notNull().default('default'),

  /** Partial `UserSettings['systemAgent']` (tiers + task slots). */
  systemAgent: jsonb('system_agent').$type<Record<string, unknown>>(),

  /** Partial `UserSettings['defaultAgent']` (new-agent main model pin). */
  defaultAgent: jsonb('default_agent').$type<Record<string, unknown>>(),

  /** Partial `UserSettings['image']` (e.g. `{ defaultImageNum }`). */
  image: jsonb('image').$type<Record<string, unknown>>(),

  ...timestamps,
});

export type SystemServiceModelSettingsItem = typeof systemServiceModelSettings.$inferSelect;
export type NewSystemServiceModelSettings = typeof systemServiceModelSettings.$inferInsert;
