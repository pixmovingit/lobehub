import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';
import { EyeIcon, FilePenIcon, ShieldCheckIcon, Trash2Icon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { PolicyOption } from '@/features/ResourcePermission/PolicySelect';

/**
 * Personal-share PolicySelect options. `delete` is no longer offered for new
 * grants (use `full` when removal is needed); it stays available only while a
 * row still holds a legacy `delete` value so the trigger can render and the
 * collaborator can be moved onto another level.
 */
export const useShareAccessLevelOptions = (
  currentValue?: KnowledgeBaseGrantAccessLevel,
): PolicyOption<KnowledgeBaseGrantAccessLevel>[] => {
  const { t } = useTranslation('file');

  return useMemo(() => {
    const options: PolicyOption<KnowledgeBaseGrantAccessLevel>[] = [
      {
        desc: t('library.share.accessLevel.viewDesc'),
        icon: EyeIcon,
        label: t('library.share.accessLevel.view'),
        value: 'view',
      },
      {
        desc: t('library.share.accessLevel.editDesc'),
        icon: FilePenIcon,
        label: t('library.share.accessLevel.edit'),
        value: 'edit',
      },
      {
        desc: t('library.share.accessLevel.fullDesc'),
        icon: ShieldCheckIcon,
        label: t('library.share.accessLevel.full'),
        value: 'full',
      },
    ];

    if (currentValue === 'delete') {
      options.splice(2, 0, {
        desc: t('library.share.accessLevel.deleteDesc'),
        icon: Trash2Icon,
        label: t('library.share.accessLevel.delete'),
        value: 'delete',
      });
    }

    return options;
  }, [currentValue, t]);
};
