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
import {
  Cancel01Icon,
  CustomerSupportIcon,
  TelegramIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRouterState } from '@tanstack/react-router'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SUPPORT_TELEGRAM } from '@/features/home/lib/video-home'
import { cn } from '@/lib/utils'

/**
 * Pages whose own controls sit in the bottom-right corner (chat inputs,
 * generation forms) or that run before the site exists (setup).
 */
const HIDDEN_PATH_PREFIXES = ['/setup', '/playground', '/chat', '/video-studio']

/**
 * Floating support button in the bottom-right corner. It opens a card with
 * the support Telegram account: copy the handle, scan the QR code on a
 * phone, or open the chat directly.
 */
export function SupportWidget() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const hidden = HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  if (hidden) return null

  const telegramUrl = `https://t.me/${SUPPORT_TELEGRAM}`
  const handle = `@${SUPPORT_TELEGRAM}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size='icon'
            aria-label={open ? t('Close support') : t('Contact support')}
            className='fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-lg transition-transform hover:scale-105 sm:right-6 sm:bottom-6 sm:size-14'
          />
        }
      >
        <HugeiconsIcon
          icon={open ? Cancel01Icon : CustomerSupportIcon}
          className='size-6 sm:size-7'
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        side='top'
        align='end'
        sideOffset={12}
        className='w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0'
      >
        <div className='bg-primary text-primary-foreground flex items-center gap-3 px-4 py-3.5'>
          <span className='flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15'>
            <HugeiconsIcon
              icon={CustomerSupportIcon}
              className='size-5'
              aria-hidden
            />
          </span>
          <div className='min-w-0'>
            <PopoverTitle className='text-primary-foreground text-sm font-semibold'>
              {t('Customer support')}
            </PopoverTitle>
            <p className='flex items-center gap-1.5 text-xs text-white/80'>
              <span
                className='size-2 rounded-full bg-emerald-300'
                aria-hidden
              />
              {t('Usually replies within minutes')}
            </p>
          </div>
        </div>

        <div className='flex flex-col gap-3 p-4'>
          <PopoverDescription className='text-xs leading-relaxed'>
            {t(
              'Questions about top-ups, API access or billing? Message us on Telegram.'
            )}
          </PopoverDescription>

          <div className='flex items-center gap-2.5 rounded-lg border px-3 py-2'>
            <span className='flex size-8 shrink-0 items-center justify-center rounded-full bg-[#229ED9] text-white'>
              <HugeiconsIcon
                icon={TelegramIcon}
                className='size-4'
                aria-hidden
              />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='text-muted-foreground text-xs'>Telegram</p>
              <p className='truncate font-mono text-sm font-medium'>{handle}</p>
            </div>
            <CopyButton
              value={handle}
              size='icon'
              aria-label={t('Copy Telegram account')}
            />
          </div>

          <div className='flex items-center gap-3'>
            <div className='shrink-0 rounded-md border bg-white p-1.5'>
              <QRCodeSVG
                value={telegramUrl}
                size={72}
                aria-label={t('Telegram QR code')}
              />
            </div>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              {t('Scan with your phone to open the chat in Telegram.')}
            </p>
          </div>

          <a
            href={telegramUrl}
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
      </PopoverContent>
    </Popover>
  )
}
