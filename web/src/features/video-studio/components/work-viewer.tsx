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
import {
  ChevronLeft,
  ChevronRight,
  PencilLine,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { TaskLog } from '@/features/usage-logs/types'
import dayjs from '@/lib/dayjs'
import { formatLogQuota, formatTimestamp } from '@/lib/format'

import { useWorkVideoUrl } from '../hooks/use-work-artifacts'
import type { WorkText } from '../hooks/use-work-text'
import { WorkDownloadButton } from './work-download-button'

/** A finished video with its prompt, parameters and what to do next. */
export function WorkViewer(props: {
  task: TaskLog
  text: WorkText
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  onEdit?: () => void
  onRegenerate?: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { task, text } = props
  const video = useWorkVideoUrl(task.task_id)
  const details = [
    { label: t('Parameters'), value: text.spec },
    { label: t('Cost'), value: task.quota ? formatLogQuota(task.quota) : '' },
    { label: t('Created'), value: formatTimestamp(task.submit_time) },
    {
      label: t('Kept until'),
      value: task.media_expires_at
        ? dayjs(task.media_expires_at * 1000).format('YYYY-MM-DD')
        : '',
    },
  ].filter((detail) => detail.value)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('Video details')}
      contentClassName='sm:max-w-6xl'
    >
      <div className='grid gap-4 md:h-[min(76vh,720px)] md:grid-cols-[minmax(0,1fr)_18rem]'>
        <div className='bg-ink rounded-card relative flex aspect-video items-center justify-center overflow-hidden md:aspect-auto md:h-full'>
          {video.isLoading && <Spinner className='size-6 text-white' />}
          {!video.isLoading && !video.url && (
            <span className='text-xs text-white'>
              {t('The video could not be loaded')}
            </span>
          )}
          {video.url && (
            <>
              <video
                key={task.task_id}
                src={video.url}
                controls
                autoPlay
                playsInline
                className='size-full object-contain'
              />
              <WorkDownloadButton
                url={video.url}
                filename={`${task.task_id}.mp4`}
                label={t('Download video')}
              />
            </>
          )}
          {props.onPrevious && (
            <Button
              variant='secondary'
              size='icon-lg'
              className='absolute top-1/2 left-3 -translate-y-1/2 rounded-full opacity-90'
              aria-label={t('Previous work')}
              onClick={props.onPrevious}
            >
              <ChevronLeft aria-hidden />
            </Button>
          )}
          {props.onNext && (
            <Button
              variant='secondary'
              size='icon-lg'
              className='absolute top-1/2 right-3 -translate-y-1/2 rounded-full opacity-90'
              aria-label={t('Next work')}
              onClick={props.onNext}
            >
              <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
        <div className='flex min-h-0 min-w-0 flex-col gap-4'>
          {text.prompt && (
            <section className='flex min-h-0 flex-1 flex-col gap-2'>
              <div className='flex items-center justify-between'>
                <h3 className='text-muted-foreground text-sm font-medium'>
                  {t('Prompt words')}
                </h3>
                <CopyButton value={text.prompt} aria-label={t('Copy prompt')} />
              </div>
              <p className='bg-muted/50 max-h-60 min-h-0 flex-1 overflow-y-auto rounded-lg p-3 text-sm leading-relaxed break-words whitespace-pre-wrap md:max-h-none'>
                {text.prompt}
              </p>
            </section>
          )}
          <div className='mt-auto flex shrink-0 flex-col gap-4'>
            <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm'>
              {details.map((detail) => (
                <div key={detail.label} className='contents'>
                  <dt className='text-muted-foreground'>{detail.label}</dt>
                  <dd className='text-end font-medium break-words'>
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className='grid grid-cols-2 gap-2'>
              {props.onEdit && (
                <Button variant='outline' size='lg' onClick={props.onEdit}>
                  <PencilLine aria-hidden />
                  {t('Edit again')}
                </Button>
              )}
              {props.onRegenerate && (
                <Button
                  variant='outline'
                  size='lg'
                  onClick={props.onRegenerate}
                >
                  <RotateCw aria-hidden />
                  {t('Generate again')}
                </Button>
              )}
              <Button
                variant='ghost'
                size='lg'
                className='text-destructive hover:text-destructive col-span-2'
                onClick={props.onDelete}
              >
                <Trash2 aria-hidden />
                {t('Delete')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
