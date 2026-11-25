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
import { AlertCircle, Play } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useWorkVideoUrl } from '../hooks/use-work-artifacts'
import { WorkDownloadButton } from './work-download-button'

/**
 * Cover of a finished video: its first frame, playing silently while the
 * pointer rests on it. Clicking it opens the video.
 */
export function WorkCover(props: {
  taskId: string
  title: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const video = useWorkVideoUrl(props.taskId)
  const videoRef = useRef<HTMLVideoElement>(null)

  if (video.isLoading) return <Skeleton className='size-full' />
  if (!video.url) {
    return (
      <div className='text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-xs'>
        <AlertCircle className='size-5' aria-hidden />
        {t('The video could not be loaded')}
      </div>
    )
  }
  return (
    <>
      <Button
        variant='plain'
        size='inline'
        // Out of the flow, so a portrait video cannot stretch the card.
        className='group/cover bg-ink absolute inset-0 block size-full overflow-hidden'
        aria-label={t('Play: {{title}}', { title: props.title })}
        onClick={props.onOpen}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return
          // Rejected when the pointer leaves before it starts; nothing to do.
          void videoRef.current?.play()?.catch(() => undefined)
        }}
        onPointerLeave={() => {
          if (!videoRef.current) return
          videoRef.current.pause()
          videoRef.current.currentTime = 0.1
        }}
      >
        <video
          ref={videoRef}
          // The fragment makes browsers draw a frame instead of a black box.
          src={`${video.url}#t=0.1`}
          muted
          loop
          playsInline
          preload='metadata'
          tabIndex={-1}
          className='size-full object-contain'
        />
        <span className='pointer-events-none absolute inset-0 flex items-center justify-center'>
          <span className='bg-background/90 text-foreground flex size-11 items-center justify-center rounded-full shadow transition-opacity group-hover/cover:opacity-0'>
            <Play className='size-4.5 fill-current' aria-hidden />
          </span>
        </span>
      </Button>
      <WorkDownloadButton
        url={video.url}
        filename={`${props.taskId}.mp4`}
        label={t('Download video')}
      />
    </>
  )
}
