import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { KnowledgeBaseAccessGrantModel } from '@/database/models/knowledgeBaseAccessGrant';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

// Inline tuple — avoids Turbopack HMR briefly seeing the types export as
// undefined and throwing `Object.entries` inside `z.enum(...)`.
const accessLevelSchema = z.enum(['view', 'edit', 'delete', 'full']);

/**
 * Personal-space knowledge-base sharing. Rejects calls that already sit inside
 * a workspace — those libraries use `resourcePermission` instead.
 */
const personalShareProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  if (ctx.workspaceId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Personal knowledge base sharing only applies outside a workspace',
    });
  }

  return opts.next({
    ctx: {
      grantModel: new KnowledgeBaseAccessGrantModel(ctx.serverDB, ctx.userId),
    },
  });
});

export const knowledgeBaseShareRouter = router({
  listGrants: personalShareProcedure
    .input(z.object({ knowledgeBaseId: z.string() }))
    .query(async ({ ctx, input }) => ctx.grantModel.listGrants(input.knowledgeBaseId)),

  addUsers: personalShareProcedure
    .input(
      z.object({
        accessLevel: accessLevelSchema.default('view'),
        knowledgeBaseId: z.string(),
        userIds: z.array(z.string()).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.grantModel.addUsers(input.knowledgeBaseId, input.userIds, input.accessLevel),
    ),

  updateUserAccessLevel: personalShareProcedure
    .input(
      z.object({
        accessLevel: accessLevelSchema,
        knowledgeBaseId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.grantModel.updateUserAccessLevel(input.knowledgeBaseId, input.userId, input.accessLevel),
    ),

  removeUser: personalShareProcedure
    .input(
      z.object({
        knowledgeBaseId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.grantModel.removeUser(input.knowledgeBaseId, input.userId),
    ),

  setShareWithAll: personalShareProcedure
    .input(
      z.object({
        accessLevel: accessLevelSchema.default('view'),
        enabled: z.boolean(),
        knowledgeBaseId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.grantModel.setShareWithAll(input.knowledgeBaseId, input.enabled, input.accessLevel),
    ),

  getInvite: personalShareProcedure
    .input(z.object({ knowledgeBaseId: z.string() }))
    .query(async ({ ctx, input }) => ctx.grantModel.getOrCreateInvite(input.knowledgeBaseId)),

  rotateInvite: personalShareProcedure
    .input(z.object({ knowledgeBaseId: z.string() }))
    .mutation(async ({ ctx, input }) => ctx.grantModel.rotateInvite(input.knowledgeBaseId)),

  acceptInvite: personalShareProcedure
    .input(z.object({ token: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => ctx.grantModel.acceptInvite(input.token)),

  searchUsers: personalShareProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => ctx.grantModel.searchShareableUsers(input.query)),
});
