import { describe, expect, it } from 'vitest';

import { resolveLibraryOwnerName, resolveLibrarySharingState } from './libraryHeroMeta';

describe('resolveLibraryOwnerName', () => {
  it('returns the you label for the creator', () => {
    expect(
      resolveLibraryOwnerName(
        { owner: { id: 'u1', username: 'alice' }, userId: 'u1' },
        'u1',
        'you',
      ),
    ).toBe('you');
  });

  it('prefers full name then username for other creators', () => {
    expect(
      resolveLibraryOwnerName(
        { owner: { fullName: 'Alice', id: 'u1', username: 'alice' }, userId: 'u1' },
        'u2',
        'you',
      ),
    ).toBe('Alice');
    expect(
      resolveLibraryOwnerName(
        { owner: { id: 'u1', username: 'alice' }, userId: 'u1' },
        'u2',
        'you',
      ),
    ).toBe('alice');
  });
});

describe('resolveLibrarySharingState', () => {
  it('maps workspace visibility', () => {
    expect(
      resolveLibrarySharingState({
        activeWorkspaceId: 'ws-1',
        visibility: 'private',
      }),
    ).toEqual({ isShared: false, statusVisibility: 'private', tagColor: 'default' });
    expect(
      resolveLibrarySharingState({
        activeWorkspaceId: 'ws-1',
        visibility: 'public',
      }),
    ).toEqual({ isShared: true, statusVisibility: 'public', tagColor: 'cyan' });
  });

  it('maps personal share grants', () => {
    expect(resolveLibrarySharingState({ isShared: false })).toEqual({
      isShared: false,
      statusVisibility: 'private',
      tagColor: 'default',
    });
    expect(resolveLibrarySharingState({ isShared: true })).toEqual({
      isShared: true,
      statusVisibility: 'public',
      tagColor: 'blue',
    });
  });
});
