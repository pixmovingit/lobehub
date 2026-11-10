import { describe, expect, it } from 'vitest';

import { canMutatePersonalLibraryContent } from './personalLibraryContentAccess';

describe('canMutatePersonalLibraryContent', () => {
  it('allows owners and unresolved grades', () => {
    expect(canMutatePersonalLibraryContent('owner')).toBe(true);
    expect(canMutatePersonalLibraryContent(undefined)).toBe(true);
    expect(canMutatePersonalLibraryContent(null)).toBe(true);
  });

  it('requires at least edit for personal-share grades', () => {
    expect(canMutatePersonalLibraryContent('view')).toBe(false);
    expect(canMutatePersonalLibraryContent('edit')).toBe(true);
    expect(canMutatePersonalLibraryContent('delete')).toBe(true);
    expect(canMutatePersonalLibraryContent('full')).toBe(true);
  });
});
