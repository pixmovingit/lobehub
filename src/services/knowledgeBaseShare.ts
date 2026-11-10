import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

class KnowledgeBaseShareService {
  listGrants = (knowledgeBaseId: string) =>
    lambdaClient.knowledgeBaseShare.listGrants.query({ knowledgeBaseId });

  addUsers = (
    knowledgeBaseId: string,
    userIds: string[],
    accessLevel: KnowledgeBaseGrantAccessLevel = 'view',
  ) => lambdaClient.knowledgeBaseShare.addUsers.mutate({ accessLevel, knowledgeBaseId, userIds });

  updateUserAccessLevel = (
    knowledgeBaseId: string,
    userId: string,
    accessLevel: KnowledgeBaseGrantAccessLevel,
  ) =>
    lambdaClient.knowledgeBaseShare.updateUserAccessLevel.mutate({
      accessLevel,
      knowledgeBaseId,
      userId,
    });

  removeUser = (knowledgeBaseId: string, userId: string) =>
    lambdaClient.knowledgeBaseShare.removeUser.mutate({ knowledgeBaseId, userId });

  setShareWithAll = (
    knowledgeBaseId: string,
    enabled: boolean,
    accessLevel: KnowledgeBaseGrantAccessLevel = 'view',
  ) =>
    lambdaClient.knowledgeBaseShare.setShareWithAll.mutate({
      accessLevel,
      enabled,
      knowledgeBaseId,
    });

  getInvite = (knowledgeBaseId: string) =>
    lambdaClient.knowledgeBaseShare.getInvite.query({ knowledgeBaseId });

  rotateInvite = (knowledgeBaseId: string) =>
    lambdaClient.knowledgeBaseShare.rotateInvite.mutate({ knowledgeBaseId });

  acceptInvite = (token: string) => lambdaClient.knowledgeBaseShare.acceptInvite.mutate({ token });

  searchUsers = (params: { limit?: number; offset?: number; query?: string } = {}) =>
    lambdaClient.knowledgeBaseShare.searchUsers.query(params);
}

export const knowledgeBaseShareService = new KnowledgeBaseShareService();
