'use client';

import { Button, Flexbox, Text } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { knowledgeBaseShareService } from '@/services/knowledgeBaseShare';

/**
 * Accepts a personal knowledge-base invite token from the URL and opens the library.
 */
const AcceptKnowledgeBaseShareInvite = memo(() => {
  const { t } = useTranslation('file');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const { data, error, isLoading } = useSWR(
    token ? ['knowledgeBaseShareAccept', token] : null,
    () => knowledgeBaseShareService.acceptInvite(token),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!token) {
    return (
      <Flexbox align={'center'} gap={16} height={'100%'} justify={'center'} padding={24}>
        <Text weight={600}>{t('library.share.acceptFailedTitle')}</Text>
        <Text type={'secondary'}>{t('library.share.acceptMissingToken')}</Text>
        <Button type={'primary'} onClick={() => navigate('/resource')}>
          {t('library.share.backToDocs')}
        </Button>
      </Flexbox>
    );
  }

  if (error) {
    return (
      <Flexbox align={'center'} gap={16} height={'100%'} justify={'center'} padding={24}>
        <Text weight={600}>{t('library.share.acceptFailedTitle')}</Text>
        <Text type={'secondary'}>{t('library.share.acceptFailed')}</Text>
        <Button type={'primary'} onClick={() => navigate('/resource')}>
          {t('library.share.backToDocs')}
        </Button>
      </Flexbox>
    );
  }

  if (isLoading || !data) return <Loading debugId="AcceptKnowledgeBaseShareInvite" />;

  return (
    <Flexbox align={'center'} gap={16} height={'100%'} justify={'center'} padding={24}>
      <Text weight={600}>{t('library.share.acceptSuccessTitle')}</Text>
      <Text type={'secondary'}>{t('library.share.acceptSuccessDesc', { name: data.name })}</Text>
      <Button
        type={'primary'}
        onClick={() => navigate(`/resource/library/${data.knowledgeBaseId}`)}
      >
        {t('library.share.openLibrary')}
      </Button>
    </Flexbox>
  );
});

AcceptKnowledgeBaseShareInvite.displayName = 'AcceptKnowledgeBaseShareInvite';

export default AcceptKnowledgeBaseShareInvite;
