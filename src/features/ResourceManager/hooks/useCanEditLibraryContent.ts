'use client';

import { useTranslation } from 'react-i18next';

import { usePersonalLibraryContentEditable } from '@/features/ResourceLibrary/usePersonalLibraryContentEditable';
import { usePermission } from '@/hooks/usePermission';

/**
 * Explorer mutations (rename, remove, batch, drag) require both the global
 * content permission and a personal-share grade of at least `edit`.
 */
export const useCanEditLibraryContent = () => {
  const { t } = useTranslation('file');
  const { allowed, reason } = usePermission('edit_own_content');
  const canEditPersonalLibrary = usePersonalLibraryContentEditable();

  if (!canEditPersonalLibrary) {
    return {
      allowed: false,
      reason: t('library.share.accessLevel.viewDesc'),
    };
  }

  return { allowed, reason };
};
