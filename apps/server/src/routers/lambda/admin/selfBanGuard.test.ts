import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { assertNotSelfBan } from './selfBanGuard';

describe('assertNotSelfBan', () => {
  it('allows banning another user', () => {
    expect(() => assertNotSelfBan('admin_1', 'user_2', true)).not.toThrow();
  });

  it('allows updating self without a ban change', () => {
    expect(() => assertNotSelfBan('admin_1', 'admin_1', undefined)).not.toThrow();
  });

  it('allows clearing a ban on self', () => {
    expect(() => assertNotSelfBan('admin_1', 'admin_1', false)).not.toThrow();
  });

  it('rejects banning the signed-in admin', () => {
    expect(() => assertNotSelfBan('admin_1', 'admin_1', true)).toThrow(TRPCError);
    try {
      assertNotSelfBan('admin_1', 'admin_1', true);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot ban your own account.',
      });
    }
  });
});
