import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import { type LobeChatDatabase } from '@lobechat/database';

import { initNewUserForBusiness } from '@/business/server/user';
import { SystemServiceModelSettingsModel } from '@/database/models/systemServiceModelSettings';
import { UserModel } from '@/database/models/user';
import type { UserSettingsItem } from '@/database/schemas';
import { initializeServerAnalytics } from '@/libs/analytics';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { FileS3 } from '@/server/modules/S3';
import { SystemAdminService } from '@/server/services/systemAdmin';

type CreatedUser = {
  createdAt?: Date | null;
  email?: string | null;
  firstName?: string | null;
  id: string;
  lastName?: string | null;
  phone?: string | null;
  username?: string | null;
};

export class UserService {
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase) {
    this.db = db;
  }

  /**
   * Copy admin Service Model defaults into a brand-new account's personal
   * settings. Existing users are never rewritten — only registration-time
   * bootstrap (Better Auth `user.create.after` → `initUser`) reaches here.
   */
  async #seedServiceModelDefaults(userId: string) {
    const defaults = await SystemServiceModelSettingsModel.get(this.db);
    if (!defaults) return;

    const patch: Partial<UserSettingsItem> = {
      ...(defaults.defaultAgent ? { defaultAgent: defaults.defaultAgent } : {}),
      ...(defaults.image ? { image: defaults.image } : {}),
      ...(defaults.systemAgent ? { systemAgent: defaults.systemAgent } : {}),
    };
    if (Object.keys(patch).length === 0) return;

    await new UserModel(this.db, userId).updateSetting(patch);
  }

  async initUser(user: CreatedUser) {
    if (ENABLE_BUSINESS_FEATURES) {
      try {
        await initNewUserForBusiness(user.id, user.createdAt);
      } catch (error) {
        console.error(error);
        console.error('Failed to init new user for business');
      }
    } else {
      // Self-host bootstrap: the first account (or the first after a
      // zero-admin state) becomes the global super_admin.
      try {
        await new SystemAdminService(this.db).promoteBootstrapAdminIfNeeded(user.id);
      } catch (error) {
        console.error(error);
        console.error('Failed to promote bootstrap system admin');
      }
    }

    try {
      await this.#seedServiceModelDefaults(user.id);
    } catch (error) {
      console.error(error);
      console.error('Failed to seed deployment Service Model defaults for new user');
    }

    const analytics = await initializeServerAnalytics();
    analytics?.identify(user.id, {
      email: user.email ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      phone: user.phone ?? undefined,
      username: user.username ?? undefined,
    });
    analytics?.track({
      name: 'user_register_completed',
      properties: {
        spm: 'user_service.init_user.user_created',
      },
      userId: user.id,
    });
  }

  getUserApiKeys = async (id: string) => {
    return UserModel.getUserApiKeys(this.db, id, KeyVaultsGateKeeper.getUserKeyVaults);
  };

  getUserAvatar = async (id: string, image: string) => {
    const s3 = new FileS3();
    const s3FileUrl = `user/avatar/${id}/${image}`;

    try {
      const file = await s3.getFileByteArray(s3FileUrl);
      if (!file) {
        return null;
      }
      return Buffer.from(file);
    } catch (error) {
      console.error('Failed to get user avatar', error);
    }
  };
}
