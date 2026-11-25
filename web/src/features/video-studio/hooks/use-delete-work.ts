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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { TaskLog } from '@/features/usage-logs/types'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { deleteTaskPrompt } from '../api'
import { hideTask, readHiddenTasks } from '../lib/hidden-works'

/**
 * Deletes a work: the prompt the server kept with it, then the work from this
 * browser's lists. The work stays when the server could not delete the prompt,
 * so the user can try again.
 */
export function useDeleteWork() {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState(readHiddenTasks)

  const deleteWork = async (taskId: string, task?: TaskLog) => {
    if (task?.properties?.console_request) {
      try {
        await deleteTaskPrompt(taskId)
      } catch (error) {
        toast.error(
          getServerErrorMessage(error, t('Could not delete the work'))
        )
        return
      }
    }
    setHidden(hideTask(taskId))
  }
  return { hidden, deleteWork }
}
