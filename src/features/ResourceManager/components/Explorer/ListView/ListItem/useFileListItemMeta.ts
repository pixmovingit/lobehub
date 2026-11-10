import { CUSTOM_FOLDER_FILE_TYPE, DERIVED_DOCUMENT_SOURCE_TYPE } from '@lobechat/const';
import dayjs from 'dayjs';
import { useMemo } from 'react';

import { PAGE_FILE_TYPE } from '@/features/ResourceManager/constants';
import { isChunkingSupported } from '@/libs/document-loaders/loaderType';

const formatRelativeOrDate = (value: Date) =>
  dayjs().diff(dayjs(value), 'd') < 7 ? dayjs(value).fromNow() : dayjs(value).format('YYYY-MM-DD');

interface UseFileListItemMetaOptions {
  createdAt: Date;
  fileType: string;
  metadata?: {
    emoji?: string | null;
  } | null;
  name?: string | null;
  sourceType?: string | null;
  updatedAt: Date;
}

export const useFileListItemMeta = ({
  createdAt,
  fileType,
  metadata,
  name,
  sourceType,
  updatedAt,
}: UseFileListItemMetaOptions) =>
  useMemo(() => {
    const lowerFileType = fileType?.toLowerCase();
    const lowerName = name?.toLowerCase();
    const isPDF = lowerFileType === 'pdf' || lowerName?.endsWith('.pdf');
    const isOfficeFile =
      lowerName?.endsWith('.xls') ||
      lowerName?.endsWith('.xlsx') ||
      lowerName?.endsWith('.doc') ||
      lowerName?.endsWith('.docx') ||
      lowerName?.endsWith('.ppt') ||
      lowerName?.endsWith('.pptx') ||
      lowerName?.endsWith('.odt');

    return {
      displayTime: formatRelativeOrDate(createdAt),
      displayUpdatedTime: formatRelativeOrDate(updatedAt),
      emoji:
        sourceType === DERIVED_DOCUMENT_SOURCE_TYPE || fileType === PAGE_FILE_TYPE
          ? metadata?.emoji
          : null,
      isFolder: fileType === CUSTOM_FOLDER_FILE_TYPE,
      isPage:
        !isPDF &&
        !isOfficeFile &&
        (sourceType === DERIVED_DOCUMENT_SOURCE_TYPE || fileType === PAGE_FILE_TYPE),
      isSupportedForChunking: isChunkingSupported({ fileType, name }),
    };
  }, [createdAt, fileType, metadata?.emoji, name, sourceType, updatedAt]);
