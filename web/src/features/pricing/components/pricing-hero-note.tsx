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
  ArrowDown01Icon,
  CustomerSupportIcon,
  TelegramIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SUPPORT_TELEGRAM } from '@/features/home/lib/video-home'
import { cn } from '@/lib/utils'

import type { PricingModel } from '../types'

/** Suffix that marks a model as offering unrestricted content. */
const UNRESTRICTED_SUFFIX = '-P'

type PricingHeroNoteProps = {
  /** Models the viewer's groups can use. */
  models: PricingModel[]
  className?: string
}

/**
 * The note under the model plaza title. Viewers whose groups include
 * unrestricted models learn how to spot them; everyone else gets a
 * highlighted button that points them to support on Telegram, since those
 * models are hidden from them.
 */
export function PricingHeroNote(props: PricingHeroNoteProps) {
  const { t } = useTranslation()
  const offersUnrestricted = props.models.some((model) =>
    model.model_name.endsWith(UNRESTRICTED_SUFFIX)
  )

  if (offersUnrestricted) {
    return (
      <p
        className={cn(
          'text-muted-foreground text-body sm:text-body-lg',
          props.className
        )}
      >
        {t(
          'Multi-channel groups billed per second, per token or per request, pick what fits; models ending in {{suffix}} offer unrestricted content.',
          { suffix: UNRESTRICTED_SUFFIX }
        )}
      </p>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2',
        props.className
      )}
    >
      <p className='text-muted-foreground text-body sm:text-body-lg'>
        {t(
          'Multi-channel groups billed per second, per token or per request, pick what fits.'
        )}
      </p>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant='link'
              size='inline'
              className='text-brand dark:text-brand-on-dark text-body gap-1.5 font-medium whitespace-normal'
            />
          }
        >
          <HugeiconsIcon
            icon={CustomerSupportIcon}
            className='size-4 shrink-0'
            aria-hidden
          />
          {t('Get unrestricted content models: contact support')}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className='size-3.5 shrink-0'
            aria-hidden
          />
        </PopoverTrigger>
        <PopoverContent className='w-auto max-w-[calc(100vw-2rem)] p-2'>
          <a
            href={`https://t.me/${SUPPORT_TELEGRAM}`}
            target='_blank'
            rel='noopener noreferrer'
            className={cn(
              buttonVariants(),
              'h-auto min-h-8 py-1.5 whitespace-normal'
            )}
          >
            <HugeiconsIcon icon={TelegramIcon} className='size-4' aria-hidden />
            {t('Open Telegram @{{handle}}', { handle: SUPPORT_TELEGRAM })}
          </a>
        </PopoverContent>
      </Popover>
    </div>
  )
}
