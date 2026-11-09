import { eq } from 'drizzle-orm';

import {
  type NewSystemServiceModelSettings,
  type SystemServiceModelSettingsItem,
  systemServiceModelSettings,
} from '../schemas';
import type { LobeChatDatabase } from '../type';

export type SystemServiceModelSettingsPatch = Pick<
  NewSystemServiceModelSettings,
  'defaultAgent' | 'image' | 'systemAgent'
>;

const SINGLETON_ID = 'default';

/**
 * Deployment-wide Service Model defaults (主模型 / Flash / 验收 / …).
 * One row keyed by `default`; absent row means "fall back to code + SYSTEM_AGENT env".
 */
export class SystemServiceModelSettingsModel {
  static get = async (
    db: LobeChatDatabase,
  ): Promise<SystemServiceModelSettingsItem | undefined> => {
    const [row] = await db
      .select()
      .from(systemServiceModelSettings)
      .where(eq(systemServiceModelSettings.id, SINGLETON_ID))
      .limit(1);

    return row;
  };

  static upsert = async (
    db: LobeChatDatabase,
    patch: SystemServiceModelSettingsPatch,
  ): Promise<SystemServiceModelSettingsItem> => {
    const [row] = await db
      .insert(systemServiceModelSettings)
      .values({
        defaultAgent: patch.defaultAgent ?? null,
        id: SINGLETON_ID,
        image: patch.image ?? null,
        systemAgent: patch.systemAgent ?? null,
      })
      .onConflictDoUpdate({
        set: {
          ...(patch.defaultAgent !== undefined ? { defaultAgent: patch.defaultAgent } : {}),
          ...(patch.image !== undefined ? { image: patch.image } : {}),
          ...(patch.systemAgent !== undefined ? { systemAgent: patch.systemAgent } : {}),
          updatedAt: new Date(),
        },
        target: systemServiceModelSettings.id,
      })
      .returning();

    return row;
  };
}
