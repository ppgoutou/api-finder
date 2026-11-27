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
import { useId, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPPORT_TELEGRAM } from '@/features/home/lib/video-home'

import { useUnixNow } from '../hooks/use-expiring-works'
import {
  formatElapsed,
  workProgress,
  type WorkStage,
} from '../lib/work-progress'

/** Lights that stand in for the frame when there is no reference image. */
const LIGHTS = (
  <span className='studio-dev-lights' aria-hidden>
    <span />
    <span />
    <span />
  </span>
)

/**
 * Stands in for a work that is still being made: what it is doing, for how
 * long, and how that compares with the user's recent works on the model. The
 * frame "develops" from the top down as far as that comparison goes and never
 * claims to be done; without one a scan line only sweeps the frame.
 */
export function WorkProgress(props: {
  stage: WorkStage
  /** Unix seconds. */
  startedAt: number
  /** Seconds such works usually take, or null when not known. */
  typical: number | null
  /** Reference image the frame develops into. */
  backdrop?: string
  /** Ratio the video was asked for, such as 9:16, to outline its shape. */
  ratio?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const now = useUnixNow(1000)
  const stageId = useId()
  const progress = workProgress(props.startedAt, now, props.typical)

  let stage = t('Generating')
  if (props.stage === 'submitting') stage = t('Submitting')
  if (props.stage === 'queued') stage = t('Queued')

  let hint = t('You can leave this page.')
  if (progress.minutesLeft !== null) {
    hint = t('About {{count}} min left, by your recent works.', {
      count: progress.minutesLeft,
    })
  }
  if (progress.slow) {
    hint = t('Taking longer than usual. A failure is refunded automatically.')
  }
  const [width, height] = (props.ratio ?? '').split(':').map(Number)
  const portrait = width > 0 && height > width

  // Known progress develops the frame that far; unknown progress sweeps while
  // generating and only breathes while waiting for a turn.
  let mode = 'waiting'
  if (props.stage === 'generating') mode = 'sweeping'
  if (progress.share !== null) mode = 'known'
  const percent =
    progress.share === null ? undefined : Math.round(progress.share * 100)

  const frame = props.backdrop ? (
    <img
      src={props.backdrop}
      alt=''
      aria-hidden
      className='studio-dev-backdrop'
    />
  ) : (
    LIGHTS
  )

  return (
    <div
      className='studio-dev bg-ink relative flex size-full flex-col justify-end overflow-hidden p-3 text-white'
      data-mode={mode}
      data-slow={progress.slow || undefined}
      data-compact={props.compact || undefined}
      style={{ '--dev': (progress.share ?? 0).toFixed(3) } as CSSProperties}
    >
      <div
        role='progressbar'
        aria-labelledby={stageId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className='absolute inset-0'
      >
        <div className='studio-dev-raw absolute inset-0'>{frame}</div>
        <div className='studio-dev-developed absolute inset-0'>{frame}</div>
        {!props.compact && <div className='studio-dev-grain' />}
        <div className='studio-dev-scan' />
      </div>
      {portrait && (
        // The shape of the video on its way, inside the landscape card.
        <span
          aria-hidden
          className='absolute inset-y-2 left-1/2 -translate-x-1/2 rounded-md border border-white/40'
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      )}
      {!props.compact && (
        <span className='studio-dev-text absolute inset-x-3 top-2.5 text-xs text-white/90'>
          {hint}
          {progress.slow && (
            <>
              {' '}
              <a
                href={`https://t.me/${SUPPORT_TELEGRAM}`}
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium text-white underline underline-offset-2'
              >
                {t('Contact support')}
              </a>
            </>
          )}
        </span>
      )}
      <div
        role='status'
        className='studio-dev-text relative flex items-baseline justify-between gap-2 text-xs font-semibold'
      >
        <span id={stageId}>{stage}</span>
        {/* Read out with the stage only; a ticking clock would never stop. */}
        <span className='tabular-nums' aria-hidden>
          {formatElapsed(progress.elapsed)}
        </span>
      </div>
    </div>
  )
}
