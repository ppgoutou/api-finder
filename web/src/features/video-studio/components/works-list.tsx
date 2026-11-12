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
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Film, PencilLine, Trash2 } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useModelDisplayName } from '@/features/pricing/hooks'
import { getTaskArtifacts, getUserTaskLogs } from '@/features/usage-logs/api'
import { TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'
import { formatTimestamp } from '@/lib/format'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { STUDIO_WORKS_QUERY_KEY } from '../constants'
import { draftFromVideoRequest } from '../lib/draft'
import { hideTask, readHiddenTasks } from '../lib/hidden-works'
import { recallTaskPrompt } from '../lib/prompt-history'
import type { StudioDraft } from '../types'
import { WorkDownloadButton } from './work-download-button'

const WORKS_PAGE_SIZE = 12
const POLL_INTERVAL_MS = 5000

function isFinished(task: TaskLog) {
  return (
    task.status === TASK_STATUS.SUCCESS || task.status === TASK_STATUS.FAILURE
  )
}

function WorkVideo(props: { task: TaskLog }) {
  const { t } = useTranslation()
  const artifacts = useQuery({
    queryKey: ['video-studio', 'artifacts', props.task.task_id],
    queryFn: () => getTaskArtifacts(props.task.task_id),
    staleTime: 10 * 60 * 1000,
    meta: { errorToast: false },
  })
  const url =
    artifacts.data?.artifacts.find((artifact) => artifact.type === 'video')
      ?.content_url ?? artifacts.data?.legacyContentUrl

  if (artifacts.isLoading) return <Skeleton className='size-full' />
  if (!url) {
    return (
      <div className='text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-xs'>
        <AlertCircle className='size-5' aria-hidden />
        {t('The video could not be loaded')}
      </div>
    )
  }
  return (
    <>
      <video
        src={url}
        controls
        playsInline
        preload='metadata'
        className='size-full bg-black object-contain'
      />
      <WorkDownloadButton url={url} filename={`${props.task.task_id}.mp4`} />
    </>
  )
}

function WorkCard(props: {
  task: TaskLog
  compact?: boolean
  onEdit?: (draft: Partial<StudioDraft>) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const task = props.task
  const remembered = recallTaskPrompt(task.task_id)
  const modelName = task.properties?.origin_model_name
  const displayName = useModelDisplayName()
  // The remembered spec starts with the model ID it was submitted with.
  const specModel = remembered?.request?.model ?? modelName
  let specText = remembered?.spec || (modelName && displayName(modelName))
  if (specModel && remembered?.spec.startsWith(specModel)) {
    specText = displayName(specModel) + remembered.spec.slice(specModel.length)
  }
  // Tasks submitted before the full request was kept bring back what is
  // known: the prompt and the model.
  let editDraft: Partial<StudioDraft> = {}
  if (remembered?.request) {
    editDraft = draftFromVideoRequest(remembered.request)
  } else {
    if (remembered?.prompt) editDraft.prompt = remembered.prompt
    if (modelName) editDraft.model = modelName
  }
  const onEdit = props.onEdit

  let media = (
    <div className='text-muted-foreground flex size-full flex-col items-center justify-center gap-2 text-xs'>
      <Spinner className='size-5' />
      {t('Generating')}
      {task.progress && <span className='font-semibold'>{task.progress}</span>}
    </div>
  )
  if (task.status === TASK_STATUS.SUCCESS) media = <WorkVideo task={task} />
  if (task.status === TASK_STATUS.FAILURE) {
    media = (
      <div className='text-destructive flex size-full flex-col items-center justify-center gap-1 px-4 text-center text-xs'>
        <AlertCircle className='size-5' aria-hidden />
        <span className='font-semibold'>{t('Generation failed')}</span>
        {task.fail_reason && !props.compact && (
          <span className='text-muted-foreground line-clamp-3'>
            {translateServerText(t, task.fail_reason)}
          </span>
        )}
      </div>
    )
  }

  return (
    <article className='bg-card border-border/60 overflow-hidden rounded-xl border'>
      <div className='bg-muted/40 relative aspect-video'>{media}</div>
      <div className={cn('flex flex-col gap-1', props.compact ? 'p-2' : 'p-3')}>
        <p
          className={cn(
            props.compact ? 'truncate text-xs' : 'line-clamp-2 min-h-10 text-sm'
          )}
        >
          {remembered?.prompt || t('Video task')}
        </p>
        <div className='flex items-center gap-2'>
          <p
            className={cn(
              'text-muted-foreground min-w-0 flex-1 truncate',
              props.compact ? 'text-[11px]' : 'text-xs'
            )}
          >
            {specText || task.task_id}
            {' · '}
            {formatTimestamp(task.submit_time)}
          </p>
          {onEdit && Object.keys(editDraft).length > 0 && (
            <Button
              variant='ghost'
              size='icon-xs'
              className='shrink-0'
              onClick={() => onEdit(editDraft)}
              aria-label={t('Edit again')}
              title={t('Edit again')}
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

/**
 * The signed-in user's latest video tasks, refreshed while any is running.
 * With `onEdit`, each work offers to load its request back into the composer.
 * Deleting a work, after a confirmation, hides it in this browser.
 */
export function WorksList(props: {
  limit?: number
  /** Up to six small cards per row, as on the dashboard. */
  compact?: boolean
  onEdit?: (draft: Partial<StudioDraft>) => void
}) {
  const { t } = useTranslation()
  const pageSize = props.limit ?? WORKS_PAGE_SIZE
  const gridClassName = props.compact
    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
    : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
  const skeletonCount = Math.min(pageSize, props.compact ? 6 : 3)
  const [hidden, setHidden] = useState(readHiddenTasks)
  const [deleting, setDeleting] = useState<string | null>(null)
  const works = useQuery({
    queryKey: [...STUDIO_WORKS_QUERY_KEY, pageSize],
    queryFn: async () => {
      const response = await getUserTaskLogs({
        p: 1,
        page_size: pageSize,
      })
      return (response.data?.items ?? []) as TaskLog[]
    },
    refetchInterval: (query) =>
      query.state.data?.some((task) => !isFinished(task))
        ? POLL_INTERVAL_MS
        : false,
  })

  if (works.isLoading) {
    return (
      <div className={gridClassName}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <Skeleton key={index} className='aspect-video rounded-xl' />
        ))}
      </div>
    )
  }
  const tasks = (works.data ?? []).filter(
    (task) => !hidden.includes(task.task_id)
  )
  if (tasks.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Film aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('No videos yet')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Videos you create appear here. You can play and download them.'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <>
      <div className={gridClassName}>
        {tasks.map((task) => (
          <WorkCard
            key={task.task_id}
            task={task}
            compact={props.compact}
            onEdit={props.onEdit}
            onDelete={() => setDeleting(task.task_id)}
          />
        ))}
      </div>
      <ConfirmDialog
        destructive
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this video?')}
        desc={t(
          'The video is removed from your works in this browser. Its usage record is kept.'
        )}
        confirmText={t('Delete')}
        handleConfirm={() => {
          if (deleting) setHidden(hideTask(deleting))
          setDeleting(null)
        }}
      />
    </>
  )
}
