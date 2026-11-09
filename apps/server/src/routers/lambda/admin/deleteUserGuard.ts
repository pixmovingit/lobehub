import { TRPCError } from '@trpc/server';

export type DeleteAdminUserDecision = {
  actorIsBootstrapAdmin: boolean;
  actorUserId: string;
  targetIsSuperAdmin: boolean;
  targetUserId: string;
};

/**
 * Who may delete whom in self-hosted user administration:
 * - nobody may delete their own account from this surface
 * - only the bootstrap (initial) admin may delete another system admin
 * - any permitted admin may delete a non-admin account
 */
export const assertCanDeleteAdminUser = ({
  actorIsBootstrapAdmin,
  actorUserId,
  targetIsSuperAdmin,
  targetUserId,
}: DeleteAdminUserDecision) => {
  if (actorUserId === targetUserId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot delete your own account.',
    });
  }

  if (targetIsSuperAdmin && !actorIsBootstrapAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the initial administrator can delete another system administrator.',
    });
  }
};
