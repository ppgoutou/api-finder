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
import { PlayCircle, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useHomePlayback } from '../hooks/use-home-playback'

interface ShowcaseVideoProps {
  /** Video URL; empty renders the placeholder. */
  src: string
  poster?: string
  /** Accessible description of the clip. */
  label: string
  /** Load eagerly (the hero clip); others load lazily. */
  eager?: boolean
  /** Show a button that turns the clip's sound on and off. */
  soundToggle?: boolean
  /**
   * Native controls for reduced-motion visitors. Off when the clip sits inside
   * a button that opens the player dialog, which has its own controls.
   */
  allowControls?: boolean
  className?: string
  /** Moves the sound button from its top-right corner. */
  soundToggleClassName?: string
}

/**
 * Muted looping clip that plays only while on screen and while no clip plays
 * in the player dialog. With reduced motion it stays paused; without a
 * source, or when it fails to load, it renders a placeholder.
 */
export function ShowcaseVideo(props: ShowcaseVideoProps) {
  const { t } = useTranslation()
  const playback = useHomePlayback()
  const videoRef = useRef<HTMLVideoElement>(null)
  const visibleRef = useRef(false)
  const suspendedRef = useRef(playback.suspended)
  const [failed, setFailed] = useState(false)
  const [muted, setMuted] = useState(true)
  const [reducedMotion] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const src = props.src

  useEffect(() => {
    const video = videoRef.current
    if (
      !video ||
      reducedMotion ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
        if (entry.isIntersecting && !suspendedRef.current) {
          video.play().catch(() => undefined)
        } else {
          video.pause()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [src, reducedMotion])

  // Pause while the player dialog plays a clip; resume if still on screen.
  useEffect(() => {
    suspendedRef.current = playback.suspended
    const video = videoRef.current
    if (!video) return
    if (playback.suspended) {
      video.pause()
    } else if (visibleRef.current && !reducedMotion) {
      video.play().catch(() => undefined)
    }
  }, [playback.suspended, reducedMotion])

  if (!src || failed) {
    return (
      <div
        role='img'
        aria-label={t('Video preview: {{label}}', { label: props.label })}
        className={cn(
          'flex size-full items-center justify-center bg-ink-raised text-white/60',
          props.className
        )}
      >
        <PlayCircle className='size-10' strokeWidth={1.25} aria-hidden />
      </div>
    )
  }

  // Without a poster, loading metadata shows the first frame.
  let preload: 'auto' | 'metadata' | 'none' = props.poster ? 'none' : 'metadata'
  if (props.eager) preload = 'auto'

  const toggleSound = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !muted
    setMuted(!muted)
    // Turning sound on is a user gesture, so playback may start here even
    // with reduced motion.
    if (muted) video.play().catch(() => undefined)
  }

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={props.poster || undefined}
        muted={muted}
        loop
        playsInline
        controls={reducedMotion && (props.allowControls ?? true)}
        preload={preload}
        aria-label={props.label}
        onError={() => setFailed(true)}
        className={cn('bg-ink-raised size-full object-cover', props.className)}
      />
      {props.soundToggle && (
        <Button
          type='button'
          size='sm'
          variant='secondary'
          onClick={toggleSound}
          className={cn(
            'absolute top-3 right-3 gap-1.5 rounded-full bg-ink/70 hover:bg-ink/90 text-white/90',
            props.soundToggleClassName
          )}
        >
          {muted ? (
            <VolumeX data-icon='inline-start' aria-hidden />
          ) : (
            <Volume2 data-icon='inline-start' aria-hidden />
          )}
          {muted ? t('Play sound') : t('Mute')}
        </Button>
      )}
    </>
  )
}
