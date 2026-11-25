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
import { useUnixNow } from '../hooks/use-expiring-works'
import { restoredAssets } from '../lib/draft'
import { hideTask, readHiddenTasks } from '../lib/hidden-works'
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

const IMAGE_TASKS_PAGE_SIZE = 24
const POLL_INTERVAL_MS = 5000
const SKELETON_COUNT = 8
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
  const generating = useStudioImageWorks((state) => state.generating)
  const removeImage = useStudioImageWorks((state) => state.remove)
  const [hidden, setHidden] = useState(readHiddenTasks)
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
      generating > 0 ||
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

  const confirmDelete = () => {
    if (deleting && 'image' in deleting) {
      removeImage(deleting.image.id)
      // Its task would otherwise be listed in its place.
      if (deleting.image.taskId) setHidden(hideTask(deleting.image.taskId))
    }
    if (deleting && 'task' in deleting) {
      setHidden(hideTask(deleting.task.task_id))
    }
    setDeleting(null)
  }

  if (listed.length === 0 && works.isLoading) {
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
      {listed.length === 0 ? (
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
                'The image is removed from your works in this browser. Its usage record is kept.'
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
