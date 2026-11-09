import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { assertCanDeleteAdminUser } from './deleteUserGuard';

describe('assertCanDeleteAdminUser', () => {
  it('allows any admin to delete a regular user', () => {
    expect(() =>
      assertCanDeleteAdminUser({
        actorIsBootstrapAdmin: false,
        actorUserId: 'admin_2',
        targetIsSuperAdmin: false,
        targetUserId: 'user_1',
      }),
    ).not.toThrow();
  });

  it('allows the bootstrap admin to delete another system admin', () => {
    expect(() =>
      assertCanDeleteAdminUser({
        actorIsBootstrapAdmin: true,
        actorUserId: 'bootstrap',
        targetIsSuperAdmin: true,
        targetUserId: 'admin_2',
      }),
    ).not.toThrow();
  });

  it('rejects deleting yourself', () => {
    expect(() =>
      assertCanDeleteAdminUser({
        actorIsBootstrapAdmin: true,
        actorUserId: 'bootstrap',
        targetIsSuperAdmin: true,
        targetUserId: 'bootstrap',
      }),
    ).toThrow(TRPCError);
  });

  it('rejects a non-bootstrap admin deleting another system admin', () => {
    try {
      assertCanDeleteAdminUser({
        actorIsBootstrapAdmin: false,
        actorUserId: 'admin_2',
        targetIsSuperAdmin: true,
        targetUserId: 'admin_3',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only the initial administrator can delete another system administrator.',
      });
    }
  });
});
