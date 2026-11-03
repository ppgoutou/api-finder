/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Download, Image as ImageIcon, PencilLine, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { formatTimestamp } from '@/lib/format'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { restoredAssets } from '../lib/draft'
import type { StudioDraft } from '../types'

/**
 * Images generated in this browser, newest first. With `onEdit`, each image
 * offers to load its prompt, model, size and references into the composer.
 * Deleting an image, after a confirmation, removes it from this browser.
 */
export function ImageWorksList(props: {
  onEdit?: (draft: Partial<StudioDraft>, size: string) => void
}) {
  const { t } = useTranslation()
  const works = useStudioImageWorks((state) => state.works)
  const removeWork = useStudioImageWorks((state) => state.remove)
  const [deleting, setDeleting] = useState<string | null>(null)

  if (works.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ImageIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('No images yet')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Images you create appear here. Download the ones you want to keep; image links expire after a while.'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
        {works.map((work) => (
          <article
            key={work.id}
            className='bg-card border-border/60 overflow-hidden rounded-xl border'
          >
            <div className='bg-muted/40 relative aspect-square'>
              <img
                src={work.url}
                alt={work.prompt}
                loading='lazy'
                className='size-full object-contain'
              />
              <Button
                variant='secondary'
                size='icon'
                className='absolute top-2 right-2 size-8 rounded-full opacity-90'
                render={
                  <a
                    href={work.url}
                    target='_blank'
                    rel='noreferrer'
                    download={`${work.id}.png`}
                  />
                }
                aria-label={t('Download image')}
              >
                <Download className='size-4' aria-hidden />
              </Button>
            </div>
            <div className='flex flex-col gap-1 p-3'>
              <p className='line-clamp-2 min-h-10 text-sm'>{work.prompt}</p>
              <div className='flex items-center gap-2'>
                <p className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
                  {work.model} · {work.size.replace('x', '×')} ·{' '}
                  {formatTimestamp(work.createdAt)}
                </p>
                {props.onEdit && (
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    className='shrink-0'
                    aria-label={t('Edit again')}
                    title={t('Edit again')}
                    onClick={() =>
                      props.onEdit?.(
                        {
                          model: work.model,
                          prompt: work.prompt,
                          references: restoredAssets(
                            'image',
                            work.references ?? []
                          ),
                        },
                        work.size
                      )
                    }
                  >
                    <PencilLine aria-hidden />
                  </Button>
                )}
                <Button
                  variant='ghost'
                  size='icon-xs'
                  className='hover:text-destructive shrink-0'
                  onClick={() => setDeleting(work.id)}
                  aria-label={t('Delete')}
                  title={t('Delete')}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <ConfirmDialog
        destructive
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this image?')}
        desc={t(
          'The image is removed from this browser. Download it first if you want to keep it.'
        )}
        confirmText={t('Delete')}
        handleConfirm={() => {
          if (deleting) removeWork(deleting)
          setDeleting(null)
        }}
      />
    </>
  )
}
