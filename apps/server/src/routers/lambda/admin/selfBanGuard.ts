import { TRPCError } from '@trpc/server';

/** Reject an admin trying to ban the account they are currently signed in as. */
export const assertNotSelfBan = (
  actorUserId: string,
  targetUserId: string,
  banned: boolean | undefined,
) => {
  if (targetUserId === actorUserId && banned === true) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot ban your own account.',
    });
  }
};
