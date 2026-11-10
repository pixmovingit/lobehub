import { describe, expect, it } from 'vitest';

import { resolveHistoryEditorName } from './resolveHistoryEditorName';

describe('resolveHistoryEditorName', () => {
  it('labels the current user as you', () => {
    expect(
      resolveHistoryEditorName({
        currentUserId: 'u1',
        editor: { fullName: 'Ada', id: 'u1', username: 'ada' },
        userId: 'u1',
        youLabel: 'you',
      }),
    ).toBe('you');
  });

  it('prefers the list profile then the fallback directory', () => {
    expect(
      resolveHistoryEditorName({
        currentUserId: 'me',
        editor: { fullName: 'Ada', id: 'u1', username: 'ada' },
        fallbackFullName: 'Other',
        userId: 'u1',
        youLabel: 'you',
      }),
    ).toBe('Ada');
    expect(
      resolveHistoryEditorName({
        currentUserId: 'me',
        editor: { id: 'u1', username: 'ada' },
        userId: 'u1',
        youLabel: 'you',
      }),
    ).toBe('ada');
    expect(
      resolveHistoryEditorName({
        currentUserId: 'me',
        fallbackFullName: 'Other',
        userId: 'u1',
        youLabel: 'you',
      }),
    ).toBe('Other');
  });
});
