// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { systemAiModels, systemAiProviders } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { SystemAiProviderModel } from '../systemAiProvider';

const serverDB: LobeChatDatabase = await getTestDB();

beforeEach(async () => {
  await serverDB.delete(systemAiModels);
  await serverDB.delete(systemAiProviders);
});

afterEach(async () => {
  await serverDB.delete(systemAiModels);
  await serverDB.delete(systemAiProviders);
});

describe('SystemAiProviderModel', () => {
  it('creates a provider and lists it for every user merge', async () => {
    await SystemAiProviderModel.create(serverDB, {
      id: 'corp-proxy',
      keyVaults: { apiKey: 'sk-test', baseURL: 'https://proxy.example.com/v1' },
      name: 'Corp Proxy',
      settings: { sdkType: 'openai' },
    });

    const list = await SystemAiProviderModel.listProviderListItems(serverDB);
    expect(list).toEqual([
      expect.objectContaining({
        enabled: true,
        id: 'corp-proxy',
        name: 'Corp Proxy',
        source: 'custom',
      }),
    ]);

    const runtime = await SystemAiProviderModel.getRuntimeConfig(serverDB);
    expect(runtime['corp-proxy']?.keyVaults).toEqual({
      apiKey: 'sk-test',
      baseURL: 'https://proxy.example.com/v1',
    });
  });

  it('cascades model deletes when the provider is removed', async () => {
    await SystemAiProviderModel.create(serverDB, {
      id: 'corp-proxy',
      name: 'Corp Proxy',
    });
    await SystemAiProviderModel.createModel(serverDB, {
      displayName: 'GPT',
      id: 'gpt-4o',
      providerId: 'corp-proxy',
    });

    expect(await SystemAiProviderModel.listModelsByProviderId(serverDB, 'corp-proxy')).toHaveLength(
      1,
    );

    await SystemAiProviderModel.delete(serverDB, 'corp-proxy');

    expect(await SystemAiProviderModel.listModelsByProviderId(serverDB, 'corp-proxy')).toHaveLength(
      0,
    );
    expect(await SystemAiProviderModel.listProviders(serverDB)).toHaveLength(0);
  });

  it('updates model display name and enabled flag', async () => {
    await SystemAiProviderModel.create(serverDB, {
      id: 'corp-proxy',
      name: 'Corp Proxy',
    });
    await SystemAiProviderModel.createModel(serverDB, {
      displayName: 'GPT',
      id: 'gpt-4o',
      providerId: 'corp-proxy',
    });

    await SystemAiProviderModel.updateModel(serverDB, 'corp-proxy', 'gpt-4o', {
      displayName: 'GPT 4o',
      enabled: false,
    });

    const models = await SystemAiProviderModel.listModelsByProviderId(serverDB, 'corp-proxy');
    expect(models).toEqual([
      expect.objectContaining({
        displayName: 'GPT 4o',
        enabled: false,
        id: 'gpt-4o',
      }),
    ]);
  });

  it('lists models only for enabled providers in the all-models catalog', async () => {
    await SystemAiProviderModel.create(serverDB, {
      enabled: false,
      id: 'disabled-proxy',
      name: 'Disabled',
    });
    await SystemAiProviderModel.createModel(serverDB, {
      id: 'hidden-model',
      providerId: 'disabled-proxy',
    });

    await SystemAiProviderModel.create(serverDB, {
      id: 'live-proxy',
      name: 'Live',
    });
    await SystemAiProviderModel.createModel(serverDB, {
      id: 'live-model',
      providerId: 'live-proxy',
    });

    const all = await SystemAiProviderModel.listAllModels(serverDB);
    expect(all.map((m) => m.id)).toEqual(['live-model']);
  });
});
