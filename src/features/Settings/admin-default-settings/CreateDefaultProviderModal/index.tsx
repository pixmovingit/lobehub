'use client';

import { createModal, Flexbox, Icon, type ModalInstance } from '@lobehub/ui';
import { t } from 'i18next';
import { Brain } from 'lucide-react';

import CreateDefaultProviderContent, {
  type CreateDefaultProviderContentProps,
} from './Content';

export const createCreateDefaultProviderModal = (
  props: CreateDefaultProviderContentProps,
): ModalInstance =>
  createModal({
    content: <CreateDefaultProviderContent {...props} />,
    footer: null,
    maskClosable: true,
    styles: {
      content: { paddingBlock: 16, paddingInline: 24 },
    },
    title: (
      <Flexbox horizontal align="center" gap={8}>
        <Icon icon={Brain} />
        {t('adminDefaultSettings.createTitle', { ns: 'setting' })}
      </Flexbox>
    ),
    width: 'min(90vw, 640px)',
  });
