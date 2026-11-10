import { isValidEditorData } from './isValidEditorData';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * History rows sometimes store the Lexical root node itself (`{ type: 'root',
 * children }`) instead of the editor document wrapper (`{ root }`). Diff already
 * unwraps that shape; coerce it at the API boundary so restore clients see a
 * document object.
 */
export const coerceHistoryEditorDocument = (value: unknown): unknown => {
  if (
    isObject(value) &&
    value.type === 'root' &&
    Array.isArray(value.children) &&
    !('root' in value)
  ) {
    return { root: value };
  }

  return value;
};

/**
 * Returns a setDocument-ready editor document, or null when the payload cannot
 * be loaded (null / `{}` / empty root).
 */
export const normalizeHistoryEditorData = (value: unknown): Record<string, unknown> | null => {
  const coerced = coerceHistoryEditorDocument(value);
  return isValidEditorData(coerced) ? coerced : null;
};
