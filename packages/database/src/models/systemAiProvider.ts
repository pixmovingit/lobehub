import { and, asc, desc, eq } from 'drizzle-orm';
import type { AiProviderListItem, AiProviderRuntimeConfig } from '@lobechat/types';
import type { AiProviderModelListItem, EnabledAiModel } from 'model-bank';
import { normalizeAiModelType } from 'model-bank';

import type {
  NewSystemAiModel,
  NewSystemAiProvider,
  SystemAiModelItem,
  SystemAiProviderItem,
} from '../schemas';
import { systemAiModels, systemAiProviders } from '../schemas';
import type { LobeChatDatabase } from '../type';

interface GateKeeper {
  decrypt: (ciphertext: string) => Promise<{ plaintext: string }>;
  encrypt: (plaintext: string) => Promise<string>;
}

export interface DecryptedSystemAiProvider extends Omit<SystemAiProviderItem, 'keyVaults'> {
  keyVaults: Record<string, unknown>;
}

export interface CreateSystemAiProviderParams {
  checkModel?: string | null;
  config?: NewSystemAiProvider['config'];
  description?: string | null;
  enabled?: boolean;
  fetchOnClient?: boolean | null;
  id: string;
  keyVaults?: Record<string, unknown>;
  logo?: string | null;
  name: string;
  settings?: NewSystemAiProvider['settings'];
  sort?: number | null;
}

export interface UpdateSystemAiProviderParams {
  checkModel?: string | null;
  config?: NewSystemAiProvider['config'];
  description?: string | null;
  enabled?: boolean;
  fetchOnClient?: boolean | null;
  /** Plaintext key vaults. Omit to leave existing ciphertext untouched. */
  keyVaults?: Record<string, unknown>;
  logo?: string | null;
  name?: string;
  settings?: NewSystemAiProvider['settings'];
  sort?: number | null;
}

export interface CreateSystemAiModelParams {
  abilities?: NewSystemAiModel['abilities'];
  config?: NewSystemAiModel['config'];
  contextWindowTokens?: number | null;
  description?: string | null;
  displayName?: string | null;
  enabled?: boolean;
  id: string;
  parameters?: NewSystemAiModel['parameters'];
  pricing?: NewSystemAiModel['pricing'];
  providerId: string;
  releasedAt?: string | null;
  settings?: NewSystemAiModel['settings'];
  sort?: number | null;
  type?: string | null;
}

export interface UpdateSystemAiModelParams {
  description?: string | null;
  displayName?: string | null;
  enabled?: boolean;
  sort?: number | null;
  type?: string | null;
}

/**
 * Static-method model for deployment-wide default AI providers / models.
 * Mirrors `SystemBotProviderModel`: no per-user scoping, optional gateKeeper.
 */
export class SystemAiProviderModel {
  static listProviders = async (
    db: LobeChatDatabase,
  ): Promise<Omit<DecryptedSystemAiProvider, 'keyVaults'>[]> => {
    const rows = await db
      .select({
        accessedAt: systemAiProviders.accessedAt,
        checkModel: systemAiProviders.checkModel,
        config: systemAiProviders.config,
        createdAt: systemAiProviders.createdAt,
        description: systemAiProviders.description,
        enabled: systemAiProviders.enabled,
        fetchOnClient: systemAiProviders.fetchOnClient,
        id: systemAiProviders.id,
        logo: systemAiProviders.logo,
        name: systemAiProviders.name,
        settings: systemAiProviders.settings,
        sort: systemAiProviders.sort,
        updatedAt: systemAiProviders.updatedAt,
      })
      .from(systemAiProviders)
      .orderBy(asc(systemAiProviders.sort), desc(systemAiProviders.updatedAt));

    return rows;
  };

  static listProviderListItems = async (db: LobeChatDatabase): Promise<AiProviderListItem[]> => {
    const rows = await db
      .select({
        description: systemAiProviders.description,
        enabled: systemAiProviders.enabled,
        id: systemAiProviders.id,
        logo: systemAiProviders.logo,
        name: systemAiProviders.name,
        sort: systemAiProviders.sort,
      })
      .from(systemAiProviders)
      .orderBy(asc(systemAiProviders.sort), desc(systemAiProviders.updatedAt));

    // Surface as custom so existing Provider UI (logo / description) keeps working.
    return rows.map((row) => ({
      description: row.description ?? undefined,
      enabled: Boolean(row.enabled),
      id: row.id,
      logo: row.logo ?? undefined,
      name: row.name,
      sort: row.sort ?? undefined,
      source: 'custom' as const,
    }));
  };

  static findById = async (
    db: LobeChatDatabase,
    id: string,
    gateKeeper?: GateKeeper,
  ): Promise<DecryptedSystemAiProvider | null> => {
    const [row] = await db
      .select()
      .from(systemAiProviders)
      .where(eq(systemAiProviders.id, id))
      .limit(1);

    if (!row) return null;
    return decryptProvider(row, gateKeeper);
  };

  static getRuntimeConfig = async (
    db: LobeChatDatabase,
    decryptor?: (cipher: string | null) => Promise<any>,
  ): Promise<Record<string, AiProviderRuntimeConfig>> => {
    const rows = await db
      .select({
        config: systemAiProviders.config,
        fetchOnClient: systemAiProviders.fetchOnClient,
        id: systemAiProviders.id,
        keyVaults: systemAiProviders.keyVaults,
        settings: systemAiProviders.settings,
      })
      .from(systemAiProviders);

    const decrypt =
      decryptor ??
      (async (cipher: string | null) => {
        if (!cipher) return {};
        return JSON.parse(cipher);
      });

    const runtimeConfig: Record<string, AiProviderRuntimeConfig> = {};
    for (const item of rows) {
      let keyVaults = {};
      if (item.keyVaults) {
        try {
          keyVaults = await decrypt(item.keyVaults);
        } catch {
          /* empty */
        }
      }

      runtimeConfig[item.id] = {
        config: item.config || {},
        fetchOnClient: typeof item.fetchOnClient === 'boolean' ? item.fetchOnClient : undefined,
        keyVaults,
        settings: item.settings || {},
      };
    }

    return runtimeConfig;
  };

  static create = async (
    db: LobeChatDatabase,
    params: CreateSystemAiProviderParams,
    gateKeeper?: GateKeeper,
  ): Promise<SystemAiProviderItem> => {
    const keyVaults = await encryptKeyVaults(params.keyVaults ?? {}, gateKeeper);

    const [result] = await db
      .insert(systemAiProviders)
      .values({
        checkModel: params.checkModel ?? null,
        config: params.config ?? {},
        description: params.description ?? null,
        enabled: params.enabled ?? true,
        fetchOnClient: params.fetchOnClient ?? null,
        id: params.id,
        keyVaults,
        logo: params.logo ?? null,
        name: params.name,
        settings: params.settings ?? {},
        sort: params.sort ?? null,
      })
      .returning();

    return result;
  };

  static update = async (
    db: LobeChatDatabase,
    id: string,
    params: UpdateSystemAiProviderParams,
    gateKeeper?: GateKeeper,
  ): Promise<SystemAiProviderItem | undefined> => {
    const patch: Partial<SystemAiProviderItem> = { updatedAt: new Date() };

    if (params.name !== undefined) patch.name = params.name;
    if (params.description !== undefined) patch.description = params.description;
    if (params.logo !== undefined) patch.logo = params.logo;
    if (params.enabled !== undefined) patch.enabled = params.enabled;
    if (params.sort !== undefined) patch.sort = params.sort;
    if (params.checkModel !== undefined) patch.checkModel = params.checkModel;
    if (params.fetchOnClient !== undefined) patch.fetchOnClient = params.fetchOnClient;
    if (params.config !== undefined) patch.config = params.config;
    if (params.settings !== undefined) patch.settings = params.settings;
    if (params.keyVaults !== undefined) {
      patch.keyVaults = await encryptKeyVaults(params.keyVaults, gateKeeper);
    }

    const [updated] = await db
      .update(systemAiProviders)
      .set(patch)
      .where(eq(systemAiProviders.id, id))
      .returning();

    return updated;
  };

  static delete = async (db: LobeChatDatabase, id: string): Promise<void> => {
    await db.delete(systemAiProviders).where(eq(systemAiProviders.id, id));
  };

  static listModelsByProviderId = async (
    db: LobeChatDatabase,
    providerId: string,
  ): Promise<AiProviderModelListItem[]> => {
    const rows = await db
      .select({
        abilities: systemAiModels.abilities,
        config: systemAiModels.config,
        contextWindowTokens: systemAiModels.contextWindowTokens,
        description: systemAiModels.description,
        displayName: systemAiModels.displayName,
        enabled: systemAiModels.enabled,
        id: systemAiModels.id,
        parameters: systemAiModels.parameters,
        pricing: systemAiModels.pricing,
        releasedAt: systemAiModels.releasedAt,
        settings: systemAiModels.settings,
        type: systemAiModels.type,
      })
      .from(systemAiModels)
      .where(eq(systemAiModels.providerId, providerId))
      .orderBy(
        asc(systemAiModels.sort),
        desc(systemAiModels.enabled),
        desc(systemAiModels.updatedAt),
      );

    return rows.map((row) => ({
      ...row,
      enabled: Boolean(row.enabled),
      source: 'custom',
      type: normalizeAiModelType(row.type),
    })) as AiProviderModelListItem[];
  };

  static listAllModels = async (db: LobeChatDatabase): Promise<EnabledAiModel[]> => {
    const rows = await db
      .select({
        abilities: systemAiModels.abilities,
        config: systemAiModels.config,
        contextWindowTokens: systemAiModels.contextWindowTokens,
        displayName: systemAiModels.displayName,
        enabled: systemAiModels.enabled,
        id: systemAiModels.id,
        parameters: systemAiModels.parameters,
        pricing: systemAiModels.pricing,
        providerId: systemAiModels.providerId,
        releasedAt: systemAiModels.releasedAt,
        settings: systemAiModels.settings,
        sort: systemAiModels.sort,
        type: systemAiModels.type,
      })
      .from(systemAiModels)
      .innerJoin(systemAiProviders, eq(systemAiModels.providerId, systemAiProviders.id))
      .where(eq(systemAiProviders.enabled, true));

    return rows.map((row) => ({
      ...row,
      enabled: Boolean(row.enabled),
      source: 'custom',
      type: normalizeAiModelType(row.type),
    })) as EnabledAiModel[];
  };

  static createModel = async (
    db: LobeChatDatabase,
    params: CreateSystemAiModelParams,
  ): Promise<SystemAiModelItem> => {
    const [result] = await db
      .insert(systemAiModels)
      .values({
        abilities: params.abilities ?? {},
        config: params.config,
        contextWindowTokens: params.contextWindowTokens ?? null,
        description: params.description ?? null,
        displayName: params.displayName ?? null,
        enabled: params.enabled ?? true,
        id: params.id,
        parameters: params.parameters ?? {},
        pricing: params.pricing,
        providerId: params.providerId,
        releasedAt: params.releasedAt ? params.releasedAt.slice(0, 10) : null,
        settings: params.settings ?? {},
        sort: params.sort ?? null,
        type: normalizeAiModelType(params.type) ?? 'chat',
      })
      .returning();

    return result;
  };

  static updateModel = async (
    db: LobeChatDatabase,
    providerId: string,
    modelId: string,
    params: UpdateSystemAiModelParams,
  ): Promise<SystemAiModelItem | undefined> => {
    const patch: Partial<SystemAiModelItem> = { updatedAt: new Date() };

    if (params.displayName !== undefined) patch.displayName = params.displayName;
    if (params.description !== undefined) patch.description = params.description;
    if (params.enabled !== undefined) patch.enabled = params.enabled;
    if (params.sort !== undefined) patch.sort = params.sort;
    if (params.type !== undefined) patch.type = normalizeAiModelType(params.type) ?? 'chat';

    const [updated] = await db
      .update(systemAiModels)
      .set(patch)
      .where(and(eq(systemAiModels.providerId, providerId), eq(systemAiModels.id, modelId)))
      .returning();

    return updated;
  };

  static deleteModel = async (
    db: LobeChatDatabase,
    providerId: string,
    modelId: string,
  ): Promise<void> => {
    await db
      .delete(systemAiModels)
      .where(and(eq(systemAiModels.providerId, providerId), eq(systemAiModels.id, modelId)));
  };
}

async function encryptKeyVaults(
  keyVaults: Record<string, unknown>,
  gateKeeper?: GateKeeper,
): Promise<string> {
  const json = JSON.stringify(keyVaults);
  if (!gateKeeper) return json;
  return gateKeeper.encrypt(json);
}

async function decryptProvider(
  row: SystemAiProviderItem,
  gateKeeper?: GateKeeper,
): Promise<DecryptedSystemAiProvider> {
  if (!row.keyVaults) return { ...row, keyVaults: {} };

  try {
    const keyVaults = gateKeeper
      ? JSON.parse((await gateKeeper.decrypt(row.keyVaults)).plaintext)
      : JSON.parse(row.keyVaults);
    return { ...row, keyVaults };
  } catch {
    return { ...row, keyVaults: {} };
  }
}
