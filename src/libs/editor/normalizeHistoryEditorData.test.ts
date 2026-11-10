import { describe, expect, it } from 'vitest';

import {
  coerceHistoryEditorDocument,
  normalizeHistoryEditorData,
} from './normalizeHistoryEditorData';

const paragraph = {
  children: [
    {
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
      text: 'hello',
      type: 'text',
      version: 1,
    },
  ],
  direction: 'ltr',
  format: '',
  indent: 0,
  type: 'paragraph',
  version: 1,
};

describe('coerceHistoryEditorDocument', () => {
  it('wraps a bare Lexical root node', () => {
    const root = {
      children: [paragraph],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    };

    expect(coerceHistoryEditorDocument(root)).toEqual({ root });
  });

  it('leaves non-root payloads unchanged', () => {
    expect(coerceHistoryEditorDocument({ version: 42 })).toEqual({ version: 42 });
    expect(coerceHistoryEditorDocument(null)).toBeNull();
  });
});

describe('normalizeHistoryEditorData', () => {
  it('keeps an already-wrapped editor document', () => {
    const wrapped = {
      root: {
        children: [paragraph],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    };

    expect(normalizeHistoryEditorData(wrapped)).toEqual(wrapped);
  });

  it('wraps a bare Lexical root node', () => {
    const root = {
      children: [paragraph],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    };

    expect(normalizeHistoryEditorData(root)).toEqual({ root });
  });

  it('rejects empty or incomplete payloads', () => {
    expect(normalizeHistoryEditorData(null)).toBeNull();
    expect(normalizeHistoryEditorData({})).toBeNull();
    expect(normalizeHistoryEditorData({ version: 42 })).toBeNull();
    expect(
      normalizeHistoryEditorData({
        children: [],
        type: 'root',
      }),
    ).toBeNull();
  });
});
