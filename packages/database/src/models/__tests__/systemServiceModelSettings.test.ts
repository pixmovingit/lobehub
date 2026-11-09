// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { systemServiceModelSettings } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { SystemServiceModelSettingsModel } from '../systemServiceModelSettings';

const serverDB: LobeChatDatabase = await getTestDB();

beforeEach(async () => {
  await serverDB.delete(systemServiceModelSettings);
});

afterEach(async () => {
  await serverDB.delete(systemServiceModelSettings);
});

describe('SystemServiceModelSettingsModel', () => {
  it('returns undefined when the singleton row is missing', async () => {
    expect(await SystemServiceModelSettingsModel.get(serverDB)).toBeUndefined();
  });

  it('upserts the singleton deployment defaults and merges later patches', async () => {
    const first = await SystemServiceModelSettingsModel.upsert(serverDB, {
      systemAgent: {
        verify: { model: 'gpt-6-luna', provider: 'pix' },
      },
    });

    expect(first.id).toBe('default');
    expect(first.systemAgent).toEqual({
      verify: { model: 'gpt-6-luna', provider: 'pix' },
    });
    expect(first.defaultAgent).toBeNull();
    expect(first.image).toBeNull();

    const second = await SystemServiceModelSettingsModel.upsert(serverDB, {
      image: { defaultImageNum: 1 },
    });

    expect(second.systemAgent).toEqual({
      verify: { model: 'gpt-6-luna', provider: 'pix' },
    });
    expect(second.image).toEqual({ defaultImageNum: 1 });

    const loaded = await SystemServiceModelSettingsModel.get(serverDB);
    expect(loaded?.image).toEqual({ defaultImageNum: 1 });
  });
});
