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
  AlertCircle,
  History,
  PencilLine,
  RotateCw,
  Shuffle,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'
import { formatTimestamp } from '@/lib/format'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import type { WorkText } from '../hooks/use-work-text'
import { formatWorkCost } from '../lib/work-cost'
import { taskStage } from '../lib/work-progress'
import { taskRetention } from '../lib/work-retention'
import { WorkCover } from './work-cover'
import { WorkProgress } from './work-progress'
import { WorkRetentionBadge } from './work-retention-badge'

/** Frame every video work shares: its media over its title and actions. */
export function WorkFrame(props: {
  media: ReactNode
  title: string
  meta: string
  compact?: boolean
  actions?: ReactNode
}) {
  return (
    <article className='bg-card border-border/60 flex flex-col overflow-hidden rounded-xl border'>
      <div className='bg-muted/40 relative aspect-video overflow-hidden'>
        {props.media}
      </div>
      <div
        className={cn(
          'flex flex-1 flex-col gap-1',
          props.compact ? 'p-2' : 'p-3'
        )}
      >
        <p
          title={props.title}
          className={cn(
            props.compact
              ? 'truncate text-xs'
              : 'line-clamp-2 min-h-10 text-sm font-medium'
          )}
        >
          {props.title}
        </p>
        <p
          className={cn(
            'text-muted-foreground truncate',
            props.compact ? 'text-caption' : 'text-xs'
          )}
        >
          {props.meta}
        </p>
        {props.actions && (
          <div className='mt-auto flex flex-wrap items-center gap-1 pt-1'>
            {props.actions}
          </div>
        )}
      </div>
    </article>
  )
}

/** Why a work has no video to show. */
function WorkMessage(props: {
  icon: ReactNode
  title: string
  detail?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center gap-1 px-4 text-center text-xs',
        props.className
      )}
    >
      {props.icon}
      <span className='font-semibold'>{props.title}</span>
      {props.detail && (
        <span className='text-muted-foreground line-clamp-3'>
          {props.detail}
        </span>
      )}
    </div>
  )
}

/** One video work: in progress, finished, failed or expired. */
export function WorkCard(props: {
  task: TaskLog
  text: WorkText
  now: number
  typical: number | null
  compact?: boolean
  onOpen: () => void
  onEdit?: () => void
  /** Loads the work into the composer with its model menu open. */
  onChangeModel?: () => void
  onRegenerate?: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { task, text } = props
  const retention = taskRetention(task, props.now)
  const failed = task.status === TASK_STATUS.FAILURE
  const succeeded = task.status === TASK_STATUS.SUCCESS
  const expired = succeeded && retention?.state === 'expired'

  let media = (
    <WorkProgress
      stage={taskStage(task)}
      startedAt={task.submit_time}
      typical={props.typical}
      backdrop={text.request?.first_image_url ?? text.request?.images?.[0]}
      ratio={text.request?.ratio}
      compact={props.compact}
    />
  )
  if (succeeded) {
    media = (
      <>
        <WorkCover
          taskId={task.task_id}
          title={text.title}
          onOpen={props.onOpen}
        />
        {!props.compact && (
          <WorkRetentionBadge retention={retention} now={props.now} />
        )}
      </>
    )
  }
  if (expired) {
    let expiredDetail: string | undefined
    if (!props.compact) {
      // Without the request there are no settings to use again.
      expiredDetail = text.request
        ? t('The video has been deleted. Its settings can be used again.')
        : t('The video has been deleted.')
    }
    media = (
      <WorkMessage
        className='text-muted-foreground'
        icon={<History className='size-5' aria-hidden />}
        title={t('Expired')}
        detail={expiredDetail}
      />
    )
  }
  if (failed) {
    media = (
      <WorkMessage
        className='text-destructive'
        icon={<AlertCircle className='size-5' aria-hidden />}
        title={t('Generation failed')}
        detail={
          task.fail_reason && !props.compact
            ? translateServerText(t, task.fail_reason)
            : undefined
        }
      />
    )
  }

  return (
    <WorkFrame
      media={media}
      title={text.title}
      meta={[
        text.spec,
        formatTimestamp(task.submit_time),
        // A failed work is refunded, so its charge would mislead.
        succeeded && task.quota ? formatWorkCost(task.quota) : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      compact={props.compact}
      actions={
        <>
          {props.onEdit && (
            <Button variant='outline' size='sm' onClick={props.onEdit}>
              <PencilLine aria-hidden />
              {t('Edit again')}
            </Button>
          )}
          {props.onRegenerate && (succeeded || failed) && (
            <Button variant='outline' size='sm' onClick={props.onRegenerate}>
              <RotateCw aria-hidden />
              {failed ? t('Retry') : t('Generate again')}
            </Button>
          )}
          {failed && props.onChangeModel && !props.compact && (
            <Button variant='outline' size='sm' onClick={props.onChangeModel}>
              <Shuffle aria-hidden />
              {t('Try another model')}
            </Button>
          )}
          {failed && !props.compact && (
            <CopyButton
              value={task.task_id}
              size='sm'
              aria-label={t('Copy task ID')}
              tooltip={t('Copy task ID')}
            />
          )}
          <Button
            variant='ghost'
            size={props.compact ? 'icon-xs' : 'icon-sm'}
            className='hover:text-destructive ml-auto shrink-0'
            onClick={props.onDelete}
            aria-label={t('Delete')}
            title={t('Delete')}
          >
            <Trash2 aria-hidden />
          </Button>
        </>
      }
    />
  )
}
