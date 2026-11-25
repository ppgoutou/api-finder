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
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useRecentTasks } from '../hooks/use-expiring-works'
import {
  canOfferNotifications,
  closeNotificationOffer,
} from '../lib/task-notifications'

/** Offers a notification while a video is being made; asked once. */
export function NotifyOffer() {
  const { t } = useTranslation()
  const { runningCount } = useRecentTasks()
  const [open, setOpen] = useState(canOfferNotifications)
  if (!open || runningCount === 0) return null

  const close = () => {
    closeNotificationOffer()
    setOpen(false)
  }
  return (
    <div className='bg-muted/60 rounded-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3'>
      <Bell className='text-primary size-4 shrink-0' aria-hidden />
      <p className='min-w-0 flex-1 basis-60 text-sm'>
        {t('Videos take a few minutes. Get a notification when one is done?')}
      </p>
      <div className='flex gap-2'>
        <Button
          size='sm'
          onClick={() => {
            close()
            void Notification.requestPermission()
          }}
        >
          {t('Notify me')}
        </Button>
        <Button variant='ghost' size='sm' onClick={close}>
          {t('No thanks')}
        </Button>
      </div>
    </div>
  )
}
