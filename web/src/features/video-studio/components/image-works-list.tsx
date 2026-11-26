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
import { Image as ImageIcon } from 'lucide-react'
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
import type { TaskLog } from '@/features/usage-logs/types'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { STUDIO_WORKS_QUERY_KEY } from '../constants'
import { useDeleteWork } from '../hooks/use-delete-work'
import { useUnixNow } from '../hooks/use-expiring-works'
import { useImageGeneration } from '../hooks/use-image-generation'
import { restoredAssets } from '../lib/draft'
import { localizeMentions } from '../lib/mention-names'
import {
  imageRetention,
  imageTaskOf,
  isFinishedTask,
  listedImageTasks,
} from '../lib/work-retention'
import type { StudioDraft, StudioImage } from '../types'
import { ImageTaskCards } from './image-task-cards'
import { ImageWorkCard, WorkImage } from './image-work-card'
import { WorkProgress } from './work-progress'

const IMAGE_TASKS_PAGE_SIZE = 24
const POLL_INTERVAL_MS = 5000
const SKELETON_COUNT = 8
/** How far the browser's clock may be ahead of the server's. */
const CLOCK_SKEW_SECONDS = 60
const GRID_CLASS_NAME =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 min-[112.5rem]:grid-cols-8'

type Listed =
  | { createdAt: number; image: StudioImage }
  | { createdAt: number; task: TaskLog }

/**
 * Images the user created on this site, newest first: those generated in this
 * browser, and the user's image tasks it has no images of, refreshed while any
 * is running. With `onEdit`, each image offers to load its prompt, model, size
 * and references into the composer. Deleting an image, after a confirmation,
 * removes it from this browser. Each image shows how long it stays available.
 */
export function ImageWorksList(props: {
  onEdit?: (draft: Partial<StudioDraft>, size: string) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const displayName = useModelDisplayName()
  const images = useStudioImageWorks((state) => state.works)
  const pending = useStudioImageWorks((state) => state.pending)
  const failedRequests = useStudioImageWorks((state) => state.failed)
  const removeFailed = useStudioImageWorks((state) => state.removeFailed)
  const generate = useImageGeneration()
  const removeImage = useStudioImageWorks((state) => state.remove)
  const { hidden, deleteWork } = useDeleteWork()
  const [deleting, setDeleting] = useState<Listed | null>(null)
  const [pageSize, setPageSize] = useState(IMAGE_TASKS_PAGE_SIZE)
  const now = useUnixNow()
  const works = useQuery({
    queryKey: [...STUDIO_WORKS_QUERY_KEY, 'image', pageSize],
    queryFn: async () => {
      const response = await getUserTaskLogs({
        p: 1,
        page_size: pageSize,
        kind: 'image',
      })
      return {
        items: (response.data?.items ?? []) as TaskLog[],
        total: response.data?.total ?? 0,
      }
    },
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      pending.length > 0 ||
      query.state.data?.items.some((task) => !isFinishedTask(task))
        ? POLL_INTERVAL_MS
        : false,
  })
  const loaded = works.data?.items ?? []
  const hasMore = loaded.length < (works.data?.total ?? 0)
  const listed: Listed[] = [
    ...images.map((image) => ({ createdAt: image.createdAt, image })),
    ...listedImageTasks(loaded, images, hidden).map((task) => ({
      createdAt: task.submit_time,
      task,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt)

  // A plugin model's request also shows up as running tasks; each of those
  // takes the place of one waiting card, oldest request first.
  const unmatched = loaded.filter((task) => !isFinishedTask(task))
  const waiting = [...pending].reverse().flatMap((request) => {
    let count = request.count
    while (count > 0) {
      const index = unmatched.findIndex(
        (task) =>
          task.properties?.origin_model_name === request.model &&
          task.submit_time >= request.startedAt - CLOCK_SKEW_SECONDS
      )
      if (index < 0) break
      unmatched.splice(index, 1)
      count -= 1
    }
    return Array.from({ length: count }, (_, index) => ({
      key: `${request.id}-${index}`,
      request,
    }))
  })

  const confirmDelete = () => {
    if (deleting && 'image' in deleting) {
      removeImage(deleting.image.id)
      // Its task would otherwise be listed in its place.
      if (deleting.image.taskId) {
        void deleteWork(
          deleting.image.taskId,
          imageTaskOf(deleting.image, loaded)
        )
      }
    }
    if (deleting && 'task' in deleting) {
      void deleteWork(deleting.task.task_id, deleting.task)
    }
    setDeleting(null)
  }

  if (
    listed.length === 0 &&
    waiting.length === 0 &&
    failedRequests.length === 0 &&
    works.isLoading
  ) {
    return (
      <div className={GRID_CLASS_NAME}>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className='aspect-square rounded-xl' />
        ))}
      </div>
    )
  }
  return (
    <>
      {listed.length === 0 &&
      waiting.length === 0 &&
      failedRequests.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ImageIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('No images yet')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'Images you create appear here. Download the ones you want to keep; image links expire after a while.'
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={GRID_CLASS_NAME}>
          {failedRequests.map((failure) => (
            <article
              key={failure.id}
              className='bg-card border-border/60 overflow-hidden rounded-xl border'
            >
              <div className='bg-destructive/5 flex aspect-square flex-col items-center justify-center gap-2 p-3 text-center'>
                <span className='text-destructive text-xs font-semibold'>
                  {t('Image generation failed')}
                </span>
                <span className='text-muted-foreground text-caption line-clamp-3'>
                  {failure.reason}
                </span>
                <div className='flex flex-wrap justify-center gap-1'>
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => {
                      removeFailed(failure.id)
                      void generate([failure.request], failure.request.n)
                    }}
                  >
                    {t('Retry')}
                  </Button>
                  <Button
                    size='xs'
                    variant='ghost'
                    onClick={() => removeFailed(failure.id)}
                  >
                    {t('Dismiss')}
                  </Button>
                </div>
              </div>
              <div className='flex flex-col p-2'>
                <p className='truncate text-xs font-medium'>
                  {localizeMentions(failure.request.prompt, language)}
                </p>
                <p className='text-muted-foreground text-caption truncate'>
                  {displayName(failure.request.model)}
                </p>
              </div>
            </article>
          ))}
          {waiting.map(({ key, request }) => (
            <article
              key={key}
              className='bg-card border-border/60 overflow-hidden rounded-xl border'
            >
              <div className='relative aspect-square overflow-hidden'>
                <WorkProgress
                  stage='generating'
                  startedAt={request.startedAt}
                  typical={null}
                />
              </div>
              <div className='flex flex-col p-2'>
                <p className='truncate text-xs font-medium'>
                  {localizeMentions(request.prompt, language)}
                </p>
                <p className='text-muted-foreground text-caption truncate'>
                  {[displayName(request.model), request.size.replace('x', '×')]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </article>
          ))}
          {listed.map((work) => {
            if ('task' in work) {
              return (
                <ImageTaskCards
                  key={work.task.task_id}
                  task={work.task}
                  now={now}
                  onEdit={props.onEdit}
                  onDelete={() => setDeleting(work)}
                />
              )
            }
            const image = work.image
            const task = imageTaskOf(image, loaded)
            const retention = imageRetention(image, now, loaded)
            const title = localizeMentions(image.prompt, language)
            const details = [
              displayName(image.model),
              image.size.replace('x', '×'),
            ]
            return (
              <ImageWorkCard
                key={image.id}
                title={title}
                details={details}
                createdAt={image.createdAt}
                retention={retention}
                now={now}
                onEdit={
                  props.onEdit &&
                  (() =>
                    props.onEdit?.(
                      {
                        model: image.model,
                        prompt: image.prompt,
                        references: restoredAssets(
                          'image',
                          image.references ?? []
                        ),
                      },
                      image.size
                    ))
                }
                onDelete={() => setDeleting(work)}
              >
                <WorkImage
                  url={task?.image_url ?? image.url}
                  thumbnailUrl={task?.thumbnail_url ?? image.thumbnailUrl}
                  alt={image.prompt}
                  title={title}
                  details={details}
                  filename={`image-${image.id}`}
                  expired={retention?.state === 'expired'}
                />
              </ImageWorkCard>
            )
          })}
        </div>
      )}
      {hasMore && (
        <Button
          variant='outline'
          className='self-center'
          disabled={works.isFetching}
          onClick={() => setPageSize((size) => size + IMAGE_TASKS_PAGE_SIZE)}
        >
          {works.isFetching && <Spinner />}
          {t('Load more')}
        </Button>
      )}
      <ConfirmDialog
        destructive
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this image?')}
        desc={
          deleting && 'task' in deleting
            ? t(
                'The image is removed from your works in this browser, and its prompt from our servers if it is kept there. Its usage record is kept.'
              )
            : t(
                'The image is removed from this browser. Download it first if you want to keep it.'
              )
        }
        confirmText={t('Delete')}
        handleConfirm={confirmDelete}
      />
    </>
  )
}
