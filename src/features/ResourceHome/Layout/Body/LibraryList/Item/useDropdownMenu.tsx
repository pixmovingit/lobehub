import type { DropdownItem } from '@lobehub/ui';
import { confirmModal, Icon, toast } from '@lobehub/ui';
import { EyeOffIcon, FileText, GlobeIcon, PencilLine, Trash, UsersIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useKnowledgeBaseTransferMenuItem } from '@/business/client/hooks/useKnowledgeBaseTransferMenuItem';
import { libraryCoverOf } from '@/features/LibraryCover/presets';
import { useCreateNewModal } from '@/features/LibraryModal';
import VisibilityConfirmContent from '@/features/VisibilityConfirmContent';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useResourceManageable } from '@/hooks/useResourceManageable';
import { useKnowledgeBaseStore } from '@/store/library';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

interface ActionProps {
  /**
   * Personal-share effective level for the caller (`owner` / `full` / …).
   * Used outside a workspace to decide who may open the Share page.
   */
  accessLevel?: 'owner' | 'view' | 'edit' | 'delete' | 'full';
  description?: string | null;
  id: string;
  name: string;
  /** Server-computed on the list payload: creator or KNOWLEDGE_BASE_UPDATE:all. */
  permissionManageable?: boolean;
  toggleEditing: (visible?: boolean) => void;
  userId?: string;
  visibility?: 'private' | 'public';
}

export const useDropdownMenu = ({
  accessLevel,
  id,
  name,
  description,
  permissionManageable,
  toggleEditing,
  userId,
  visibility,
}: ActionProps): (() => DropdownItem[]) => {
  const { t } = useTranslation(['file', 'common', 'chat', 'setting']);

  const removeKnowledgeBase = useKnowledgeBaseStore((s) => s.removeKnowledgeBase);
  const publishKnowledgeBaseToWorkspace = useKnowledgeBaseStore(
    (s) => s.publishKnowledgeBaseToWorkspace,
  );
  const setKnowledgeBaseVisibility = useKnowledgeBaseStore((s) => s.setKnowledgeBaseVisibility);
  const { open } = useCreateNewModal();
  const { allowed: canEdit } = usePermission('edit_own_content');
  // Cross-workspace move/copy follows the same creator-or-owner rule as the
  // other ownership actions. Unavailable row actions are omitted from the
  // compact menu instead of leaving members with disabled dead ends.
  const canManage = useResourceManageable(userId);
  const transferMenuItems = useKnowledgeBaseTransferMenuItem(id);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  // Member Permissions (workspace) or personal Share entry. Workspace keeps
  // the existing permission page; personal mode opens the OSS share page for
  // the creator so grants / invite links can be managed without a workspace.
  const activeWorkspaceId = useActiveWorkspaceId();
  // Workspace visibility (`public` / `private`) is meaningless in personal
  // mode — rows still default to `visibility: 'public'`, which used to surface
  // "改为私有" and then fail with BAD_REQUEST on the server. Gate both entries
  // on an active workspace so personal libraries only expose Share.
  const isOwnPrivateKb =
    !!activeWorkspaceId &&
    visibility === 'private' &&
    !!currentUserId &&
    !!userId &&
    userId === currentUserId;
  const isOwnPublicKb =
    !!activeWorkspaceId &&
    visibility === 'public' &&
    !!currentUserId &&
    !!userId &&
    userId === currentUserId;
  const wsNavigate = useWorkspaceAwareNavigate();
  const isOwner = !!currentUserId && !!userId && userId === currentUserId;
  // Owner or personal-share `full` may manage collaborators / invites.
  const canManagePersonalShare =
    !activeWorkspaceId && (isOwner || accessLevel === 'owner' || accessLevel === 'full');
  const memberPermissionMenuItem = useMemo(() => {
    if (activeWorkspaceId && permissionManageable) {
      return {
        icon: <Icon icon={UsersIcon} />,
        key: 'member-permissions',
        label: t('permission.page.entry', { ns: 'setting' }),
        onClick: (info: any) => {
          info.domEvent?.stopPropagation();
          wsNavigate(`/resource/library/${id}/permission`);
        },
      };
    }
    if (canManagePersonalShare) {
      return {
        icon: <Icon icon={UsersIcon} />,
        key: 'personal-share',
        label: t('library.share.menuEntry'),
        onClick: (info: any) => {
          info.domEvent?.stopPropagation();
          wsNavigate(`/resource/library/${id}/share`);
        },
      };
    }
    return null;
  }, [activeWorkspaceId, permissionManageable, canManagePersonalShare, id, t, wsNavigate]);

  const handleDelete = useCallback(() => {
    if (!canEdit) return;
    if (!id) return;

    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('library.list.confirmRemoveLibrary'),
      okButtonProps: { danger: true },
      okText: t('delete', { ns: 'common' }),
      onOk: async () => {
        try {
          await removeKnowledgeBase(id);
        } catch {
          toast.error(t('operationFailed', { ns: 'common' }));
        }
      },
      title: t('header.actions.deleteLibrary'),
    });
  }, [canEdit, id, removeKnowledgeBase, t]);

  const handleEditDescription = useCallback(() => {
    if (!canEdit) return;
    // The cover rides on the loaded list row, not on this sidebar item's props.
    const { knowledgeBaseDetailMap, knowledgeBaseListMap } = useKnowledgeBaseStore.getState();
    const library =
      knowledgeBaseDetailMap[id] ??
      Object.values(knowledgeBaseListMap)
        .flat()
        .find((item) => item.id === id);
    open({
      id,
      initialValues: {
        cover: libraryCoverOf(library?.settings),
        description: description || '',
        name,
      },
    });
  }, [canEdit, description, id, name, open]);

  const handlePublish = useCallback(() => {
    if (!isOwnPrivateKb) return;
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: <VisibilityConfirmContent variant="publish" />,
      okText: t('continue', { ns: 'common' }),
      onOk: async () => {
        try {
          await publishKnowledgeBaseToWorkspace(id);
          toast.success(t('resources.publishToWorkspace.success', { ns: 'chat' }));
        } catch (error) {
          console.error(error);
          toast.error(t('resources.publishToWorkspace.error', { ns: 'chat' }));
        }
      },
      title: t('library.publishConfirm.title'),
    });
  }, [isOwnPrivateKb, id, publishKnowledgeBaseToWorkspace, t]);

  const handleMakePrivate = useCallback(() => {
    if (!isOwnPublicKb) return;
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: <VisibilityConfirmContent variant="makePrivate" />,
      okButtonProps: { danger: true },
      okText: t('continue', { ns: 'common' }),
      onOk: async () => {
        try {
          await setKnowledgeBaseVisibility(id, 'private');
          toast.success(t('makePrivate.success', { ns: 'common' }));
        } catch (error) {
          console.error(error);
          toast.error(t('makePrivate.error', { ns: 'common' }));
        }
      },
      title: t('makePrivate.confirm.title', { ns: 'common' }),
    });
  }, [isOwnPublicKb, id, setKnowledgeBaseVisibility, t]);

  return useCallback(() => {
    // Assemble the menu as ordered groups and let the dividers fall out of which
    // groups survived. Hand-wiring a divider next to each entry silently drops
    // or duplicates separators as soon as one capability combination changes.
    const groups: NonNullable<DropdownItem[]>[] = [
      // Content edits: gated by the workspace role only. Row ownership no longer
      // gates them — the server accepts any member holding an `edit` grant.
      canEdit
        ? [
            {
              icon: <Icon icon={PencilLine} />,
              key: 'rename',
              label: t('rename', { ns: 'common' }),
              onClick: (info: any) => {
                info.domEvent?.stopPropagation();
                if (!canEdit) return;
                // Defer to next frame so the DropdownMenu fully finishes its
                // close animation and event handlers before the Popover opens.
                // Otherwise the tail-end mouseup/click bubbles to document and
                // Popover's outside-click detection fires `onOpenChange(false)`
                // one tick after we set it to true, causing the input to flash
                // open and immediately snap shut.
                requestAnimationFrame(() => toggleEditing(true));
              },
            },
            {
              icon: <Icon icon={FileText} />,
              key: 'editDescription',
              label: t('edit', { ns: 'common' }),
              onClick: (info: any) => {
                info.domEvent?.stopPropagation();
                handleEditDescription();
              },
            },
          ]
        : [],
      // Sharing: visibility switches plus the member-permission page.
      [
        canEdit && isOwnPrivateKb
          ? {
              icon: <Icon icon={GlobeIcon} />,
              key: 'publishToWorkspace',
              label: t('library.publish'),
              onClick: (info: any) => {
                info.domEvent?.stopPropagation();
                handlePublish();
              },
            }
          : null,
        canEdit && isOwnPublicKb
          ? {
              icon: <Icon icon={EyeOffIcon} />,
              key: 'makePrivate',
              label: t('makePrivate', { ns: 'common' }),
              onClick: (info: any) => {
                info.domEvent?.stopPropagation();
                handleMakePrivate();
              },
            }
          : null,
        memberPermissionMenuItem,
      ].filter(Boolean) as NonNullable<DropdownItem[]>,
      // Cross-workspace move / copy: creator-or-owner only.
      canEdit && canManage ? (transferMenuItems ?? []) : [],
      canEdit
        ? [
            {
              danger: true,
              icon: <Icon icon={Trash} />,
              key: 'delete',
              label: t('delete', { ns: 'common' }),
              onClick: handleDelete,
            },
          ]
        : [],
    ];

    return groups
      .filter((group) => group.length > 0)
      .flatMap((group, index) => (index === 0 ? group : [{ type: 'divider' as const }, ...group]));
  }, [
    canEdit,
    canManage,
    t,
    toggleEditing,
    handleDelete,
    handleEditDescription,
    handlePublish,
    handleMakePrivate,
    isOwnPrivateKb,
    isOwnPublicKb,
    memberPermissionMenuItem,
    transferMenuItems,
  ]);
};
