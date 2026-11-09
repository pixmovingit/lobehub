import { describe, expect, it } from 'vitest';

import { canDeleteAdminUser } from './canDeleteAdminUser';

describe('canDeleteAdminUser', () => {
  it('allows deleting a regular user', () => {
    expect(
      canDeleteAdminUser({
        actorIsBootstrapAdmin: false,
        actorUserId: 'admin_2',
        targetIsSuperAdmin: false,
        targetUserId: 'user_1',
      }),
    ).toBe(true);
  });

  it('allows the bootstrap admin to delete another system admin', () => {
    expect(
      canDeleteAdminUser({
        actorIsBootstrapAdmin: true,
        actorUserId: 'bootstrap',
        targetIsSuperAdmin: true,
        targetUserId: 'admin_2',
      }),
    ).toBe(true);
  });

  it('hides delete for the signed-in account', () => {
    expect(
      canDeleteAdminUser({
        actorIsBootstrapAdmin: true,
        actorUserId: 'bootstrap',
        targetIsSuperAdmin: true,
        targetUserId: 'bootstrap',
      }),
    ).toBe(false);
  });

  it('hides delete of system admins for non-bootstrap admins', () => {
    expect(
      canDeleteAdminUser({
        actorIsBootstrapAdmin: false,
        actorUserId: 'admin_2',
        targetIsSuperAdmin: true,
        targetUserId: 'admin_3',
      }),
    ).toBe(false);
  });
});
