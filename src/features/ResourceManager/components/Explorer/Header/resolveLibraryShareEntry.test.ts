import { describe, expect, it } from 'vitest';

import { resolveLibraryShareEntry } from './resolveLibraryShareEntry';

describe('resolveLibraryShareEntry', () => {
  it('returns null without a library', () => {
    expect(resolveLibraryShareEntry({ currentUserId: 'u1' })).toBeNull();
  });

  it('opens workspace permissions when manageable', () => {
    expect(
      resolveLibraryShareEntry({
        activeWorkspaceId: 'ws-1',
        libraryId: 'kb-1',
        permissionManageable: true,
      }),
    ).toEqual({
      href: '/resource/library/kb-1/permission',
      kind: 'workspace',
    });
    expect(
      resolveLibraryShareEntry({
        activeWorkspaceId: 'ws-1',
        libraryId: 'kb-1',
        permissionManageable: false,
      }),
    ).toBeNull();
  });

  it('opens personal share for the owner or full grantee', () => {
    expect(
      resolveLibraryShareEntry({
        currentUserId: 'u1',
        libraryId: 'kb-1',
        libraryUserId: 'u1',
      }),
    ).toEqual({
      href: '/resource/library/kb-1/share',
      kind: 'personal',
    });
    expect(
      resolveLibraryShareEntry({
        accessLevel: 'full',
        currentUserId: 'u2',
        libraryId: 'kb-1',
        libraryUserId: 'u1',
      }),
    ).toEqual({
      href: '/resource/library/kb-1/share',
      kind: 'personal',
    });
    expect(
      resolveLibraryShareEntry({
        accessLevel: 'edit',
        currentUserId: 'u2',
        libraryId: 'kb-1',
        libraryUserId: 'u1',
      }),
    ).toBeNull();
  });
});
