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
import { ImageViewer } from './image-viewer'
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

/**
 * One generated image with its download, or why it cannot be shown. Clicking it
 * opens the full image.
 */
export function WorkImage(props: {
  url: string
  /** Small version to list; the full image stands in when it is missing. */
  thumbnailUrl?: string
  alt: string
  title: string
  details: string[]
  filename: string
  expired: boolean
}) {
  const { t } = useTranslation()
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const [viewing, setViewing] = useState(false)
  const source = [props.thumbnailUrl, props.url].find(
    (url) => url && !failedUrls.includes(url)
  )

  if (!source) {
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
      <Button
        variant='plain'
        size='inline'
        className='block size-full cursor-zoom-in overflow-hidden'
        aria-label={t('View full image')}
        onClick={() => setViewing(true)}
      >
        <img
          src={source}
          alt={props.alt}
          loading='lazy'
          decoding='async'
          className='size-full object-cover transition-transform duration-200 hover:scale-105 motion-reduce:transition-none'
          onError={() => setFailedUrls((urls) => [...urls, source])}
        />
      </Button>
      <WorkDownloadButton
        url={props.url}
        filename={props.filename}
        label={t('Download image')}
      />
      <ImageViewer
        open={viewing}
        onOpenChange={setViewing}
        url={props.url}
        thumbnailUrl={source}
        alt={props.alt}
        title={props.title}
        details={props.details}
        filename={props.filename}
      />
    </>
  )
}

/** An image work: its media over its prompt, details and actions. */
export function ImageWorkCard(props: {
  title: string
  /** Model and size. */
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
  const details = props.details.filter(Boolean).join(' · ')

  return (
    <article className='bg-card border-border/60 overflow-hidden rounded-xl border'>
      <div className='bg-muted/40 relative aspect-square overflow-hidden'>
        {props.children}
        <WorkRetentionBadge
          retention={props.retention}
          now={props.now}
          className='top-auto bottom-2'
        />
      </div>
      <div className='flex flex-col p-2'>
        <p className='truncate text-xs font-medium' title={props.title}>
          {props.title}
        </p>
        <p
          className='text-muted-foreground text-caption truncate'
          title={details}
        >
          {details}
        </p>
        <div className='flex items-center gap-1'>
          <p className='text-muted-foreground text-micro min-w-0 flex-1 truncate tabular-nums'>
            {formatTimestamp(props.createdAt)}
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
