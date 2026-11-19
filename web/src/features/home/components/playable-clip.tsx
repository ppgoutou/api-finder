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
import { Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'

import { useHomePlayback } from '../hooks/use-home-playback'
import { ShowcaseVideo } from './showcase-video'

interface PlayableClipProps {
  src: string
  poster?: string
  /** Clip title; also the dialog title. */
  title: string
}

/**
 * A muted looping preview that opens the full clip, with sound and controls,
 * in a dialog. Background previews pause while the dialog is open. Without a
 * source it is a plain placeholder.
 */
export function PlayableClip(props: PlayableClipProps) {
  const { t } = useTranslation()
  const playback = useHomePlayback()
  const [open, setOpen] = useState(false)
  const title = props.title || t('Video preview')

  if (!props.src) {
    return <ShowcaseVideo src='' label={title} />
  }

  const changeOpen = (next: boolean) => {
    setOpen(next)
    playback.setSuspended(next)
  }

  return (
    <>
      {/* oxlint-disable-next-line design/no-raw-button -- video poster that opens the player */}
      <button
        type='button'
        onClick={() => changeOpen(true)}
        aria-label={t('Play {{title}} with sound', { title })}
        className='group focus-visible:ring-ring relative block size-full cursor-pointer outline-none focus-visible:ring-2'
      >
        <ShowcaseVideo
          src={props.src}
          poster={props.poster}
          label={title}
          allowControls={false}
        />
        <span
          aria-hidden
          className='bg-ink/0 group-hover:bg-ink/35 group-focus-visible:bg-ink/35 absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
        >
          <span className='text-ink flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold'>
            <Play className='size-4 fill-current' />
            {t('Play with sound')}
          </span>
        </span>
      </button>
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        title={title}
        contentClassName='sm:max-w-4xl'
      >
        <video
          src={props.src}
          poster={props.poster || undefined}
          controls
          autoPlay
          playsInline
          aria-label={title}
          className='aspect-video w-full rounded-lg bg-black'
        />
      </Dialog>
    </>
  )
}
