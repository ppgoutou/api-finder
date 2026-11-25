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
import { Spinner } from '@/components/ui/spinner'
import { useModelDisplayName } from '@/features/pricing/hooks'
import { TASK_STATUS } from '@/features/usage-logs/constants'
import type { TaskLog } from '@/features/usage-logs/types'
import { translateServerText } from '@/lib/server-error-message'

import { useWorkArtifacts } from '../hooks/use-work-artifacts'
import { taskRetention } from '../lib/work-retention'
import type { StudioDraft } from '../types'
import { ImageNotice, ImageWorkCard, WorkImage } from './image-work-card'

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
  const { t } = useTranslation()
  const displayName = useModelDisplayName()
  const task = props.task
  const succeeded = task.status === TASK_STATUS.SUCCESS
  const artifacts = useWorkArtifacts(task.task_id, succeeded)
  const images = (artifacts.data?.artifacts ?? []).filter(
    (artifact) => artifact.type === 'image'
  )
  const model = task.properties?.origin_model_name
  const retention = taskRetention(task, props.now)
  const title = t('Image task')
  const onEdit =
    props.onEdit && model ? () => props.onEdit?.({ model }, '') : undefined

  let state = (
    <div className='text-muted-foreground flex size-full flex-col items-center justify-center gap-2 text-xs'>
      <Spinner className='size-5' />
      {t('Generating')}
      {task.progress && <span className='font-semibold'>{task.progress}</span>}
    </div>
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
        details={model ? [displayName(model)] : []}
        createdAt={task.submit_time}
        retention={retention}
        now={props.now}
        onEdit={onEdit}
        onDelete={props.onDelete}
      >
        {image ? (
          <WorkImage
            url={image.content_url}
            alt={title}
            filename={`${task.task_id}-${image.key}`}
            expired={retention?.state === 'expired'}
          />
        ) : (
          state
        )}
      </ImageWorkCard>
    )
  })
}
