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
import { Link, useRouterState } from '@tanstack/react-router'
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { TASK_STATUS } from '@/features/usage-logs/constants'

import { useRecentTasks, useUnixNow } from '../hooks/use-expiring-works'
import { localizeMentions } from '../lib/mention-names'
import { recallTaskPrompt, rememberedTaskIds } from '../lib/prompt-history'
import { formatElapsed } from '../lib/work-progress'

/** Pages that list the works themselves. */
const WORKS_PATHS = ['/video-studio', '/my-works']
/** How long a finished work stays in the tray. */
const FINISHED_SHOWN_SECONDS = 15 * 60
const SHOWN_LIMIT = 3
const DISMISSED_KEY = 'video-studio:tray-dismissed'

function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(DISMISSED_KEY) ?? '[]'
    )
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * On pages other than the creation pages, a small panel with the videos this
 * browser submitted that are running or just finished, until it is closed.
 */
export function StudioTaskTray() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { tasks } = useRecentTasks()
  const now = useUnixNow(1000)
  const [dismissed, setDismissed] = useState(readDismissed)

  if (WORKS_PATHS.some((path) => pathname.startsWith(path))) return null
  const remembered = rememberedTaskIds()
  const shown = (tasks ?? [])
    .filter(
      (task) =>
        remembered.has(task.task_id) &&
        !dismissed.includes(task.task_id) &&
        (!task.finish_time || now - task.finish_time < FINISHED_SHOWN_SECONDS)
    )
    .slice(0, SHOWN_LIMIT)
  if (shown.length === 0) return null

  const close = () => {
    const next = [...dismissed, ...shown.map((task) => task.task_id)]
    setDismissed(next)
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      // Without storage the tray stays closed until the page reloads.
    }
  }

  return (
    <section
      aria-label={t('Your videos')}
      className='bg-popover text-popover-foreground rounded-card fixed right-4 bottom-20 z-40 w-[min(20rem,calc(100vw-2rem))] border shadow-lg sm:right-6 sm:bottom-24'
    >
      <header className='flex items-center gap-2 border-b px-3 py-2'>
        <h2 className='text-card-title flex-1'>{t('Your videos')}</h2>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('Close')}
          onClick={close}
        >
          <X aria-hidden />
        </Button>
      </header>
      <ul className='divide-y'>
        {shown.map((task) => {
          const prompt = recallTaskPrompt(task.task_id)?.prompt ?? ''
          let status = (
            <span className='text-muted-foreground inline-flex items-center gap-1 tabular-nums'>
              <Loader2
                className='size-3 animate-spin motion-reduce:animate-none'
                aria-hidden
              />
              {t('Generating')} {formatElapsed(now - task.submit_time)}
            </span>
          )
          if (task.status === TASK_STATUS.SUCCESS) {
            status = (
              <span className='text-success inline-flex items-center gap-1 font-medium'>
                <CheckCircle2 className='size-3' aria-hidden />
                {t('Completed')}
              </span>
            )
          }
          if (task.status === TASK_STATUS.FAILURE) {
            status = (
              <span className='text-destructive inline-flex items-center gap-1 font-medium'>
                <XCircle className='size-3' aria-hidden />
                {t('Generation failed')}
              </span>
            )
          }
          return (
            <li key={task.task_id} className='flex flex-col gap-0.5 px-3 py-2'>
              <p className='truncate text-sm'>
                {localizeMentions(prompt, language) ||
                  task.properties?.origin_model_name}
              </p>
              <p className='text-xs'>{status}</p>
            </li>
          )
        })}
      </ul>
      <div className='border-t p-2'>
        <Button
          variant='outline'
          size='sm'
          className='w-full'
          nativeButton={false}
          render={<Link to='/my-works' />}
        >
          {t('View my works')}
        </Button>
      </div>
    </section>
  )
}
