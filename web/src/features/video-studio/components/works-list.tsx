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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Film } from 'lucide-react'
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
import { getUserTaskLogs } from '@/features/usage-logs/api'
import { TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'
import { useStudioPending } from '@/stores/studio-pending-store'

import { STUDIO_WORKS_QUERY_KEY } from '../constants'
import { useDeleteWork } from '../hooks/use-delete-work'
import { useUnixNow } from '../hooks/use-expiring-works'
import { useVideoSubmit } from '../hooks/use-video-submit'
import { useWorkText, type WorkText } from '../hooks/use-work-text'
import { draftFromVideoRequest } from '../lib/draft'
import { localizeMentions } from '../lib/mention-names'
import { typicalSeconds } from '../lib/work-progress'
import {
  isFinishedTask,
  matchesWork,
  taskRetention,
  type WorkFilter,
} from '../lib/work-retention'
import type { StudioDraft, VideoTaskRequest } from '../types'
import { RegenerateDialog } from './regenerate-dialog'
import { WorkCard, WorkFrame } from './work-card'
import { WorkProgress } from './work-progress'
import { WorkViewer } from './work-viewer'
import { WorksFilterBar } from './works-filter-bar'

const WORKS_PAGE_SIZE = 12
const POLL_INTERVAL_MS = 5000

/**
 * What a work brings back to the composer. Tasks submitted before the full
 * request was kept, or in another browser, bring what is known of them.
 */
function editDraftOf(text: WorkText): Partial<StudioDraft> {
  if (text.request) return draftFromVideoRequest(text.request)
  return {
    ...(text.prompt ? { prompt: text.prompt } : {}),
    ...(text.model ? { model: text.model } : {}),
  }
}

/**
 * The signed-in user's latest video tasks, refreshed while any is running,
 * after the submissions that have no task yet. With `onEdit`, each work offers
 * to load its request back into the composer, and to submit it again when
 * this browser knows it. Deleting a work, after a confirmation, hides it in
 * this browser. With `loadMore`, older works load a page at a time, and the
 * loaded ones can be filtered and searched.
 */
export function WorksList(props: {
  limit?: number
  loadMore?: boolean
  /** Up to six small cards per row, as on the dashboard. */
  compact?: boolean
  onEdit?: (draft: Partial<StudioDraft>) => void
}) {
  const { t, i18n } = useTranslation()
  const firstPageSize = props.limit ?? WORKS_PAGE_SIZE
  const [pageSize, setPageSize] = useState(firstPageSize)
  const now = useUnixNow()
  const gridClassName = props.compact
    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
    : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
  const skeletonCount = Math.min(firstPageSize, props.compact ? 6 : 3)
  const displayName = useModelDisplayName()
  const textOf = useWorkText()
  const pendingVideos = useStudioPending((state) => state.videos)
  const { submit } = useVideoSubmit()
  const { hidden, deleteWork } = useDeleteWork()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<VideoTaskRequest | null>(
    null
  )
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [search, setSearch] = useState('')
  const works = useQuery({
    queryKey: [...STUDIO_WORKS_QUERY_KEY, 'video', pageSize],
    queryFn: async () => {
      const response = await getUserTaskLogs({
        p: 1,
        page_size: pageSize,
        kind: 'video',
      })
      return {
        items: (response.data?.items ?? []) as TaskLog[],
        total: response.data?.total ?? 0,
      }
    },
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((task) => !isFinishedTask(task))
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
  const loaded = works.data?.items ?? []
  const hasMore =
    Boolean(props.loadMore) && loaded.length < (works.data?.total ?? 0)
  const listedIds = new Set(loaded.map((task) => task.task_id))
  const pending = pendingVideos.filter(
    (video) => !video.taskId || !listedIds.has(video.taskId)
  )
  const entries = loaded
    .filter((task) => !hidden.includes(task.task_id))
    .map((task) => ({ task, text: textOf(task) }))
  const query = search.trim().toLowerCase()
  const shown = entries.filter(
    ({ task, text }) =>
      matchesWork(task, filter, now) &&
      (!query || `${text.title} ${text.spec}`.toLowerCase().includes(query))
  )
  const shownPending =
    (filter === 'all' || filter === 'running') && !query ? pending : []
  const playable = shown.filter(
    ({ task }) =>
      task.status === TASK_STATUS.SUCCESS &&
      taskRetention(task, now)?.state !== 'expired'
  )
  const viewedIndex = playable.findIndex(({ task }) => task.task_id === viewing)
  const viewed = playable.at(viewedIndex)

  const editAction = (text: WorkText) => {
    const draft = editDraftOf(text)
    if (!props.onEdit || Object.keys(draft).length === 0) return undefined
    return () => {
      setViewing(null)
      props.onEdit?.(draft)
    }
  }
  const regenerateAction = (text: WorkText) => {
    const request = text.request
    if (!props.onEdit || !request) return undefined
    return () => setRegenerating(request)
  }

  if (entries.length === 0 && pending.length === 0 && !hasMore) {
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
      {props.loadMore && (
        <WorksFilterBar
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
        />
      )}
      {shown.length === 0 && shownPending.length === 0 && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Film aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('No works match')}</EmptyTitle>
            <EmptyDescription>
              {hasMore
                ? t('Only the works loaded so far are searched.')
                : t('Try another filter or search.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className={gridClassName}>
        {shownPending.map((video) => (
          <WorkFrame
            key={video.id}
            compact={props.compact}
            title={localizeMentions(
              video.request.prompt,
              i18n.resolvedLanguage || i18n.language
            )}
            meta={
              displayName(video.request.model) +
              video.spec.slice(video.request.model.length)
            }
            media={
              <WorkProgress
                stage={video.taskId ? 'queued' : 'submitting'}
                startedAt={video.startedAt}
                typical={typicalSeconds(loaded, video.request.model)}
                backdrop={
                  video.request.first_image_url ?? video.request.images?.[0]
                }
                compact={props.compact}
              />
            }
          />
        ))}
        {shown.map(({ task, text }) => (
          <WorkCard
            key={task.task_id}
            task={task}
            text={text}
            now={now}
            typical={typicalSeconds(loaded, text.model)}
            compact={props.compact}
            onOpen={() => setViewing(task.task_id)}
            onEdit={editAction(text)}
            onRegenerate={regenerateAction(text)}
            onDelete={() => setDeleting(task.task_id)}
          />
        ))}
      </div>
      {hasMore && (
        <Button
          variant='outline'
          className='self-center'
          disabled={works.isFetching}
          onClick={() => setPageSize((size) => size + firstPageSize)}
        >
          {works.isFetching && <Spinner />}
          {t('Load more')}
        </Button>
      )}
      {viewed && viewedIndex >= 0 && (
        <WorkViewer
          task={viewed.task}
          text={viewed.text}
          onClose={() => setViewing(null)}
          onPrevious={
            viewedIndex > 0
              ? () => setViewing(playable[viewedIndex - 1].task.task_id)
              : undefined
          }
          onNext={
            viewedIndex < playable.length - 1
              ? () => setViewing(playable[viewedIndex + 1].task.task_id)
              : undefined
          }
          onEdit={editAction(viewed.text)}
          onRegenerate={regenerateAction(viewed.text)}
          onDelete={() => setDeleting(viewed.task.task_id)}
        />
      )}
      {regenerating && (
        <RegenerateDialog
          request={regenerating}
          onClose={() => setRegenerating(null)}
          onConfirm={() => {
            setRegenerating(null)
            setViewing(null)
            void submit(regenerating, 1)
          }}
        />
      )}
      <ConfirmDialog
        destructive
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this video?')}
        desc={t(
          'The video is removed from your works in this browser, and its prompt from our servers if it is kept there. Its usage record is kept.'
        )}
        confirmText={t('Delete')}
        handleConfirm={() => {
          if (deleting) {
            void deleteWork(
              deleting,
              loaded.find((task) => task.task_id === deleting)
            )
          }
          if (deleting === viewing) setViewing(null)
          setDeleting(null)
        }}
      />
    </>
  )
}
