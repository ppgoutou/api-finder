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
import { AlertCircle, PencilLine, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'

import type { WorkRetention } from '../lib/work-retention'
import { WorkDownloadButton } from './work-download-button'
import { WorkRetentionBadge } from './work-retention-badge'

/** Message in place of an image that cannot be shown. */
export function ImageNotice(props: { children: ReactNode }) {
  return (
    <div className='text-muted-foreground flex size-full flex-col items-center justify-center gap-1 px-4 text-center text-xs'>
      <AlertCircle className='size-5' aria-hidden />
      {props.children}
    </div>
  )
}

/** One generated image with its download, or why it cannot be shown. */
export function WorkImage(props: {
  url: string
  alt: string
  filename: string
  expired: boolean
}) {
  const { t } = useTranslation()
  const [failedUrl, setFailedUrl] = useState('')

  if (failedUrl === props.url) {
    return (
      <ImageNotice>
        {props.expired
          ? t('This image has expired')
          : t('The image could not be loaded')}
      </ImageNotice>
    )
  }
  return (
    <>
      <img
        src={props.url}
        alt={props.alt}
        loading='lazy'
        className='size-full object-contain'
        onError={() => setFailedUrl(props.url)}
      />
      <WorkDownloadButton
        url={props.url}
        filename={props.filename}
        label={t('Download image')}
      />
    </>
  )
}

/** An image work: its media over its prompt, details and actions. */
export function ImageWorkCard(props: {
  title: string
  /** Model and size, before the creation time. */
  details: string[]
  /** Unix seconds. */
  createdAt: number
  retention: WorkRetention | null
  now: number
  onEdit?: () => void
  onDelete: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <article className='bg-card border-border/60 overflow-hidden rounded-xl border'>
      <div className='bg-muted/40 relative aspect-square'>
        {props.children}
        <WorkRetentionBadge retention={props.retention} now={props.now} />
      </div>
      <div className='flex flex-col gap-1 p-3'>
        <p className='line-clamp-2 min-h-10 text-sm'>{props.title}</p>
        <div className='flex items-center gap-2'>
          <p className='text-muted-foreground min-w-0 flex-1 truncate text-xs'>
            {[...props.details, formatTimestamp(props.createdAt)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {props.onEdit && (
            <Button
              variant='ghost'
              size='icon-xs'
              className='shrink-0'
              aria-label={t('Edit again')}
              title={t('Edit again')}
              onClick={props.onEdit}
            >
              <PencilLine aria-hidden />
            </Button>
          )}
          <Button
            variant='ghost'
            size='icon-xs'
            className='hover:text-destructive shrink-0'
            onClick={props.onDelete}
            aria-label={t('Delete')}
            title={t('Delete')}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  )
}
