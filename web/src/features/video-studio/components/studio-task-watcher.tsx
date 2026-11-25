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
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { TASK_STATUS } from '@/features/usage-logs/constants'
import { setSiteTitleNote } from '@/lib/site-title'

import { useRecentTasks } from '../hooks/use-expiring-works'
import { localizeMentions } from '../lib/mention-names'
import { recallTaskPrompt, rememberedTaskIds } from '../lib/prompt-history'
import { showTaskNotification } from '../lib/task-notifications'
import { runningTasks } from '../lib/work-progress'

/** Pages that show the works themselves, so a finished one needs no toast. */
const WORKS_PATHS = ['/video-studio', '/my-works']

/**
 * Announces the end of tasks submitted in this browser while the user is on
 * another page or tab: a notification when the tab is hidden and the user
 * allowed it, else a toast that leads to the works. The tab's title counts
 * the running ones.
 */
export function StudioTaskWatcher() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const navigate = useNavigate()
  const { tasks, runningCount } = useRecentTasks()
  const running = useRef(new Set<string>())

  useEffect(() => {
    if (!tasks) return
    const ended = tasks.filter(
      (task) =>
        running.current.has(task.task_id) &&
        (task.status === TASK_STATUS.SUCCESS ||
          task.status === TASK_STATUS.FAILURE)
    )
    running.current = new Set(
      runningTasks(tasks, rememberedTaskIds()).map((task) => task.task_id)
    )
    const openWorks = () => void navigate({ to: '/my-works' })
    for (const task of ended) {
      const succeeded = task.status === TASK_STATUS.SUCCESS
      const title = succeeded
        ? t('Your video is ready')
        : t('Generation failed')
      const description = localizeMentions(
        recallTaskPrompt(task.task_id)?.prompt ?? '',
        language
      )
      if (
        document.hidden &&
        showTaskNotification(title, description, openWorks)
      ) {
        continue
      }
      if (
        !document.hidden &&
        WORKS_PATHS.some((path) => window.location.pathname.startsWith(path))
      ) {
        continue
      }
      const options = {
        description,
        action: { label: t('View'), onClick: openWorks },
      }
      if (succeeded) toast.success(title, options)
      else toast.error(title, options)
    }
  }, [tasks, navigate, t, language])

  const titleNote =
    runningCount > 0 ? t('{{count}} generating', { count: runningCount }) : ''
  useEffect(() => {
    setSiteTitleNote(titleNote)
    return () => setSiteTitleNote('')
  }, [titleNote])

  return null
}
