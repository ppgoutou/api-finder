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
import { TelegramIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { buttonVariants } from '@/components/ui/button'
import { SUPPORT_TELEGRAM } from '@/features/home/lib/video-home'
import { cn } from '@/lib/utils'

interface VipSupportContactProps {
  /** VIP support handle without @; empty falls back to regular support. */
  handle?: string
}

/** The Telegram account VIP users reach for round-the-clock support. */
export function VipSupportContact(props: VipSupportContactProps) {
  const { t } = useTranslation()
  const account = props.handle?.trim().replace(/^@/, '') || SUPPORT_TELEGRAM
  const handle = `@${account}`

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-2.5 rounded-lg border px-3 py-2'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-[#229ED9] text-white'>
          <HugeiconsIcon icon={TelegramIcon} className='size-4' aria-hidden />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-muted-foreground text-xs'>
            {t('VIP support, 24/7')}
          </p>
          <p className='truncate font-mono text-sm font-medium'>{handle}</p>
        </div>
        <CopyButton
          value={handle}
          size='icon'
          aria-label={t('Copy Telegram account')}
        />
      </div>
      <a
        href={`https://t.me/${account}`}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(
          buttonVariants(),
          'h-10 w-full bg-[#229ED9] text-white hover:bg-[#1a8bc2]'
        )}
      >
        <HugeiconsIcon icon={TelegramIcon} className='size-4' aria-hidden />
        {t('Open Telegram')}
      </a>
    </div>
  )
}
