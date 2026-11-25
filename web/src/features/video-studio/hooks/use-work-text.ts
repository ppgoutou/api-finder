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

import { useModelDisplayName } from '@/features/pricing/hooks'
import type { TaskLog } from '@/features/usage-logs/types'

import { localizeMentions } from '../lib/mention-names'
import { recallTaskPrompt } from '../lib/prompt-history'
import type { VideoTaskRequest } from '../types'

export interface WorkText {
  /** The prompt, or the model when this browser does not know the prompt. */
  title: string
  /** Prompt as the interface language shows it. */
  prompt?: string
  /** Model, ratio, resolution and length, as far as known. */
  spec: string
  model?: string
  request?: VideoTaskRequest
}

/** Reads how a work is named from what this browser remembers of it. */
export function useWorkText(): (task: TaskLog) => WorkText {
  const { t, i18n } = useTranslation()
  const displayName = useModelDisplayName()

  return (task) => {
    const remembered = recallTaskPrompt(task.task_id)
    const model = task.properties?.origin_model_name
    const modelName = model ? displayName(model) : ''
    // The remembered spec starts with the model ID it was submitted with.
    const specModel = remembered?.request?.model ?? model
    let spec = remembered?.spec || modelName
    if (specModel && remembered?.spec.startsWith(specModel)) {
      spec = displayName(specModel) + remembered.spec.slice(specModel.length)
    }
    const prompt = remembered?.prompt
      ? localizeMentions(
          remembered.prompt,
          i18n.resolvedLanguage || i18n.language
        )
      : undefined
    return {
      title: prompt ?? (modelName || t('Video task')),
      prompt,
      spec: spec || task.task_id,
      model,
      request: remembered?.request,
    }
  }
}
