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

import { Skeleton } from '@/components/ui/skeleton'
import { useModelDisplayName } from '@/features/pricing/hooks'
import { TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'
import { translateServerText } from '@/lib/server-error-message'

import { useWorkArtifacts } from '../hooks/use-work-artifacts'
import { consoleRequestOf } from '../lib/console-request'
import { restoredAssets } from '../lib/draft'
import { localizeMentions } from '../lib/mention-names'
import { taskStage } from '../lib/work-progress'
import { taskRetention } from '../lib/work-retention'
import type { StudioDraft } from '../types'
import { ImageNotice, ImageWorkCard, WorkImage } from './image-work-card'
import { WorkProgress } from './work-progress'

/**
 * Cards of an image task the browser has no images of, such as one still
 * running or created in another browser: one card per image it drew, or a
 * single card with its state.
 */
export function ImageTaskCards(props: {
  task: TaskLog
  now: number
  onEdit?: (draft: Partial<StudioDraft>, size: string) => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const displayName = useModelDisplayName()
  const task = props.task
  const succeeded = task.status === TASK_STATUS.SUCCESS
  // The list already links the image this site stored; other tasks are asked
  // for theirs.
  const artifacts = useWorkArtifacts(task.task_id, succeeded && !task.image_url)
  let images = (artifacts.data?.artifacts ?? [])
    .filter((artifact) => artifact.type === 'image')
    .map((artifact) => ({
      url: artifact.content_url,
      filename: `${task.task_id}-${artifact.key}`,
    }))
  if (task.image_url) {
    images = [{ url: task.image_url, filename: task.task_id }]
  }
  const model = task.properties?.origin_model_name
  const retention = taskRetention(task, props.now)
  const kept = consoleRequestOf(task)
  const title = kept
    ? localizeMentions(kept.prompt, i18n.resolvedLanguage || i18n.language)
    : t('Image task')
  const shape = [kept?.size, kept?.aspect_ratio].filter(Boolean).join(' ')
  const details = [model ? displayName(model) : '', shape.replace('x', '×')]
  const onEdit =
    props.onEdit && model
      ? () =>
          props.onEdit?.(
            kept
              ? {
                  model: kept.model,
                  prompt: kept.prompt,
                  references: restoredAssets('image', kept.image ?? []),
                }
              : { model },
            shape
          )
      : undefined

  let state = (
    <WorkProgress
      stage={taskStage(task)}
      startedAt={task.submit_time}
      typical={null}
    />
  )
  if (succeeded) {
    state = artifacts.isLoading ? (
      <Skeleton className='size-full' />
    ) : (
      <ImageNotice>
        {retention?.state === 'expired'
          ? t('This image has expired')
          : t('The image could not be loaded')}
      </ImageNotice>
    )
  }
  if (task.status === TASK_STATUS.FAILURE) {
    state = (
      <ImageNotice>
        <span className='text-destructive font-semibold'>
          {t('Generation failed')}
        </span>
        {task.fail_reason && (
          <span className='line-clamp-3'>
            {translateServerText(
              t,
              // The server words general failures for videos.
              task.fail_reason.replace(
                /^Video generation failed/,
                'Image generation failed'
              )
            )}
          </span>
        )}
      </ImageNotice>
    )
  }

  // Keyed by position, so the first card stays in place as its image arrives.
  return Array.from({ length: Math.max(1, images.length) }, (_, index) => {
    const image = images.at(index)
    return (
      <ImageWorkCard
        key={index}
        title={title}
        details={details}
        createdAt={task.submit_time}
        retention={retention}
        now={props.now}
        onEdit={onEdit}
        onDelete={props.onDelete}
      >
        {image ? (
          <WorkImage
            url={image.url}
            thumbnailUrl={task.thumbnail_url}
            alt={title}
            title={title}
            details={details}
            filename={image.filename}
            expired={retention?.state === 'expired'}
          />
        ) : (
          state
        )}
      </ImageWorkCard>
    )
  })
}
