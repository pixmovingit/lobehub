import type { DocumentHistoryListItem } from '@/server/routers/lambda/_schema/documentHistory';

/**
 * Prefer the list-endpoint profile; fall back to a directory lookup (Cloud
 * `useAuthorInfo`) and finally a "you" label when the row is the caller's.
 */
export const resolveHistoryEditorName = ({
  currentUserId,
  editor,
  fallbackFullName,
  fallbackUsername,
  userId,
  youLabel,
}: {
  currentUserId?: string | null;
  editor?: DocumentHistoryListItem['editor'];
  fallbackFullName?: string | null;
  fallbackUsername?: string | null;
  userId?: string | null;
  youLabel: string;
}): string | null => {
  if (userId && currentUserId && userId === currentUserId) return youLabel;

  return editor?.fullName || editor?.username || fallbackFullName || fallbackUsername || null;
};
