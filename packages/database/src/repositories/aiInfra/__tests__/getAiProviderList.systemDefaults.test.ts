// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import { SystemAiProviderModel } from '../../../models/systemAiProvider';
import { systemAiModels, systemAiProviders } from '../../../schemas';
import type { LobeChatDatabase } from '../../../type';
import { AiInfraRepos } from '../index';

const userId = 'system-default-provider-user';

let serverDB: LobeChatDatabase;

beforeAll(async () => {
  serverDB = await getTestDB();
}, 30_000);

beforeEach(async () => {
  await serverDB.delete(systemAiModels);
  await serverDB.delete(systemAiProviders);
});

describe('AiInfraRepos system default providers', () => {
  it('surfaces enabled system providers to every user list', async () => {
    await SystemAiProviderModel.create(serverDB, {
      enabled: true,
      id: 'pix',
      name: 'pix',
      settings: { sdkType: 'openai' },
    });
    await SystemAiProviderModel.create(serverDB, {
      enabled: false,
      id: 'disabled-proxy',
      name: 'Disabled Proxy',
    });

    const repo = new AiInfraRepos(serverDB, userId, {
      anthropic: { enabled: true },
      openai: { enabled: true },
    });
    const result = await repo.getAiProviderList();

    expect(result.find((item) => item.id === 'pix')).toMatchObject({
      enabled: true,
      id: 'pix',
      name: 'pix',
      source: 'custom',
    });
    // Disabled admin defaults must stay hidden until the admin enables them.
    expect(result.find((item) => item.id === 'disabled-proxy')).toBeUndefined();
    // Server ENABLED_* must not auto-enable builtins for a brand-new user.
    expect(result.find((item) => item.id === 'openai')).toMatchObject({ enabled: false });
    expect(result.find((item) => item.id === 'anthropic')).toMatchObject({ enabled: false });
  });

  it('keeps the admin name when a personal row freezes a stale name', async () => {
    await SystemAiProviderModel.create(serverDB, {
      enabled: true,
      id: 'pix',
      name: 'pix',
    });

    const repo = new AiInfraRepos(serverDB, userId, {});
    vi.spyOn(repo.aiProviderModel, 'getAiProviderList').mockResolvedValueOnce([
      {
        enabled: false,
        id: 'pix',
        name: 'pix333',
        source: 'custom',
      },
    ] as any);

    const result = await repo.getAiProviderList();
    expect(result.find((item) => item.id === 'pix')).toMatchObject({
      enabled: false,
      name: 'pix',
    });
  });

  it('returns the live admin name from getAiProviderDetail', async () => {
    await SystemAiProviderModel.create(serverDB, {
      description: 'corp proxy',
      enabled: true,
      id: 'pix',
      name: 'pix',
      settings: { sdkType: 'openai' },
    });

    const repo = new AiInfraRepos(serverDB, userId, {});
    vi.spyOn(repo.aiProviderModel, 'getAiProviderById').mockResolvedValueOnce({
      enabled: true,
      id: 'pix',
      keyVaults: { apiKey: 'sk-user' },
      name: 'pix333',
      source: 'custom',
    } as any);

    const detail = await repo.getAiProviderDetail('pix');
    expect(detail).toMatchObject({
      description: 'corp proxy',
      id: 'pix',
      keyVaults: { apiKey: 'sk-user' },
      name: 'pix',
      source: 'custom',
    });
  });
});
