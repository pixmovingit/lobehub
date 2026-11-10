'use client';

import type { KnowledgeBaseGrantAccessLevel } from '@lobechat/types';
import { ActionIcon, confirmModal, Empty, Flexbox, Text, toast } from '@lobehub/ui';
import { TrashIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import UserAvatar from '@/components/UserAvatar';
import PolicySelect from '@/features/ResourcePermission/PolicySelect';
import { knowledgeBaseShareService } from '@/services/knowledgeBaseShare';

import { useShareAccessLevelOptions } from './useShareAccessLevelOptions';

export interface ShareCollaborator {
  accessLevel: KnowledgeBaseGrantAccessLevel;
  avatar: string | null;
  email: string | null;
  fullName: string | null;
  grantId: string;
  id: string;
  username: string | null;
}

interface ShareCollaboratorListProps {
  collaborators: ShareCollaborator[];
  knowledgeBaseId: string;
  onChanged: () => void;
}

const displayName = (user: ShareCollaborator) =>
  user.fullName || user.username || user.email || user.id;

const ShareCollaboratorList = memo<ShareCollaboratorListProps>(
  ({ collaborators, knowledgeBaseId, onChanged }) => {
    const { t } = useTranslation(['file', 'common']);
    const levelOptions = useShareAccessLevelOptions();
    const legacyDeleteOptions = useShareAccessLevelOptions('delete');
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

    const handleAccessLevelChange = useCallback(
      async (user: ShareCollaborator, accessLevel: KnowledgeBaseGrantAccessLevel) => {
        if (user.accessLevel === accessLevel) return;
        setUpdatingUserId(user.id);
        try {
          await knowledgeBaseShareService.updateUserAccessLevel(
            knowledgeBaseId,
            user.id,
            accessLevel,
          );
          onChanged();
          toast.success(t('library.share.accessLevelUpdated'));
        } catch {
          toast.error(t('library.share.updateFailed'));
        } finally {
          setUpdatingUserId(null);
        }
      },
      [knowledgeBaseId, onChanged, t],
    );

    const handleRemove = useCallback(
      (user: ShareCollaborator) => {
        confirmModal({
          cancelText: t('cancel', { ns: 'common' }),
          content: t('library.share.removeConfirmDesc', { name: displayName(user) }),
          okButtonProps: { danger: true },
          okText: t('library.share.remove'),
          onOk: async () => {
            try {
              await knowledgeBaseShareService.removeUser(knowledgeBaseId, user.id);
              onChanged();
              toast.success(t('library.share.removeSuccess'));
            } catch {
              toast.error(t('library.share.updateFailed'));
            }
          },
          title: t('library.share.removeConfirmTitle', { name: displayName(user) }),
        });
      },
      [knowledgeBaseId, onChanged, t],
    );

    if (collaborators.length === 0) {
      return <Empty description={t('library.share.collaboratorsEmpty')} />;
    }

    return (
      <Flexbox gap={4}>
        {collaborators.map((user) => (
          <Flexbox
            horizontal
            align={'center'}
            gap={12}
            justify={'space-between'}
            key={user.id}
            paddingBlock={8}
          >
            <Flexbox horizontal align={'center'} gap={10} style={{ minWidth: 0 }}>
              <UserAvatar avatar={user.avatar || undefined} size={28} />
              <Flexbox gap={2} style={{ minWidth: 0 }}>
                <Text ellipsis weight={500}>
                  {displayName(user)}
                </Text>
                {user.email ? (
                  <Text ellipsis fontSize={12} type={'secondary'}>
                    {user.email}
                  </Text>
                ) : null}
              </Flexbox>
            </Flexbox>
            <Flexbox horizontal align={'center'} gap={8} style={{ flex: 'none' }}>
              <div style={{ minWidth: 140, width: 160 }}>
                <PolicySelect
                  loading={updatingUserId === user.id}
                  value={user.accessLevel}
                  options={user.accessLevel === 'delete' ? legacyDeleteOptions : levelOptions}
                  onChange={(level) => void handleAccessLevelChange(user, level)}
                />
              </div>
              <ActionIcon
                icon={TrashIcon}
                size={'small'}
                title={t('library.share.remove')}
                onClick={() => handleRemove(user)}
              />
            </Flexbox>
          </Flexbox>
        ))}
      </Flexbox>
    );
  },
);

ShareCollaboratorList.displayName = 'ShareCollaboratorList';

export default ShareCollaboratorList;
