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
import { useTranslation } from 'react-i18next'

import { useUnixNow } from '../hooks/use-expiring-works'
import {
  formatElapsed,
  workProgress,
  type WorkStage,
} from '../lib/work-progress'

/**
 * Stands in for a work that is still being made: what it is doing, for how
 * long, and how that compares with the user's recent works on the model. The
 * bar follows that comparison and never claims to be done; without one it
 * only pulses.
 */
export function WorkProgress(props: {
  stage: WorkStage
  /** Unix seconds. */
  startedAt: number
  /** Seconds such works usually take, or null when not known. */
  typical: number | null
  /** Reference image shown blurred behind the progress. */
  backdrop?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const now = useUnixNow(1000)
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

  return (
    <div
      role='status'
      className='bg-ink relative flex size-full flex-col justify-end overflow-hidden p-3 text-white'
    >
      {props.backdrop && (
        <img
          src={props.backdrop}
          alt=''
          aria-hidden
          className='absolute inset-0 size-full scale-110 object-cover opacity-50 blur-xl'
        />
      )}
      <div className='relative flex flex-col gap-1.5 text-xs'>
        <div className='flex items-baseline justify-between gap-2 font-semibold'>
          <span>{stage}</span>
          {/* Read out with the stage only; a ticking clock would never stop. */}
          <span className='tabular-nums' aria-hidden>
            {formatElapsed(progress.elapsed)}
          </span>
        </div>
        <div className='h-1 overflow-hidden rounded-full bg-white/25'>
          {progress.share === null ? (
            <div className='h-full w-full animate-pulse bg-white/60 motion-reduce:animate-none' />
          ) : (
            <div
              className='h-full rounded-full bg-white transition-[width] duration-1000'
              style={{ width: `${Math.max(2, progress.share * 100)}%` }}
            />
          )}
        </div>
        {!props.compact && <span className='text-white/85'>{hint}</span>}
      </div>
    </div>
  )
}
