export interface CanDeleteAdminUserInput {
  actorIsBootstrapAdmin: boolean;
  actorUserId?: string | null;
  targetIsSuperAdmin: boolean;
  targetUserId: string;
}

/** Mirrors the server delete guard so the UI only offers deletes that can succeed. */
export const canDeleteAdminUser = ({
  actorIsBootstrapAdmin,
  actorUserId,
  targetIsSuperAdmin,
  targetUserId,
}: CanDeleteAdminUserInput): boolean => {
  if (!actorUserId || actorUserId === targetUserId) return false;
  if (targetIsSuperAdmin && !actorIsBootstrapAdmin) return false;
  return true;
};
