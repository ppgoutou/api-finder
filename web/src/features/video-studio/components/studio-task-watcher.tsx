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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TASK_STATUS } from '@/features/usage-logs/constants'
import { setSiteTitleNote } from '@/lib/site-title'

import { useRecentTasks } from '../hooks/use-expiring-works'
import { localizeMentions } from '../lib/mention-names'
import { recallTaskPrompt, rememberedTaskIds } from '../lib/prompt-history'
import { showTaskNotification } from '../lib/task-notifications'
import { runningTasks } from '../lib/work-progress'

/**
 * Announces the end of tasks submitted in this browser while their tab is
 * hidden: a notification when the user allowed it, and the tab's title, which
 * otherwise counts the running ones. Visible pages show them in the works or
 * the task tray.
 */
export function StudioTaskWatcher() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const navigate = useNavigate()
  const { tasks, runningCount } = useRecentTasks()
  const running = useRef(new Set<string>())
  const [readyWhileAway, setReadyWhileAway] = useState(false)

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
      // Only a hidden tab needs telling; a visible one shows the works or
      // the tray.
      if (!document.hidden) continue
      if (succeeded) setReadyWhileAway(true)
      showTaskNotification(
        succeeded ? t('Your video is ready') : t('Generation failed'),
        localizeMentions(
          recallTaskPrompt(task.task_id)?.prompt ?? '',
          language
        ),
        openWorks
      )
    }
  }, [tasks, navigate, t, language])

  // Until the user comes back to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setReadyWhileAway(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  let titleNote = readyWhileAway ? t('Video ready') : ''
  if (runningCount > 0) {
    titleNote = t('{{count}} generating', { count: runningCount })
  }
  useEffect(() => {
    setSiteTitleNote(titleNote)
    return () => setSiteTitleNote('')
  }, [titleNote])

  return null
}
