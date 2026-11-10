import { renderHook } from '@testing-library/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { describe, expect, it } from 'vitest';

import { useFileListItemMeta } from './useFileListItemMeta';

dayjs.extend(relativeTime);

describe('useFileListItemMeta', () => {
  it('formats createdAt and updatedAt independently', () => {
    const createdAt = dayjs().subtract(2, 'hour').toDate();
    const updatedAt = dayjs().subtract(10, 'day').toDate();

    const { result } = renderHook(() =>
      useFileListItemMeta({
        createdAt,
        fileType: 'text/plain',
        name: 'notes.txt',
        sourceType: 'file',
        updatedAt,
      }),
    );

    expect(result.current.displayTime).toBe(dayjs(createdAt).fromNow());
    expect(result.current.displayUpdatedTime).toBe(dayjs(updatedAt).format('YYYY-MM-DD'));
  });
});
