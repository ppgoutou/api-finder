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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SiApplepay,
  SiGooglepay,
  SiMastercard,
  SiNaver,
  SiSamsungpay,
  SiVisa,
  SiWechat,
} from 'react-icons/si'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface StripeAcceptedMethodsProps {
  className?: string
  /** Hides the visible "Stripe supports" label where the position says it. */
  labelClassName?: string
}

interface AcceptedMethod {
  key: string
  /** English name, or an i18n key for names that have a local spelling. */
  name: string
  translated?: boolean
  logo: ReactNode
}

const CHIP_CLASS =
  'inline-flex h-5 items-center justify-center overflow-hidden rounded border border-black/10 bg-white px-1'
const TEXT_LOGO_CLASS = 'text-[10px] leading-none font-bold'

/**
 * Payment methods the Stripe checkout page offers, mirroring what is enabled
 * in the Stripe account; Stripe itself decides which of them a customer sees.
 * The first ones show as logos, the rest behind a "+N" popover.
 */
const FEATURED_METHODS: AcceptedMethod[] = [
  {
    key: 'visa',
    name: 'Visa',
    logo: <SiVisa aria-hidden='true' className='size-6 text-[#1A1F71]' />,
  },
  {
    key: 'mastercard',
    name: 'Mastercard',
    logo: <SiMastercard aria-hidden='true' className='size-5 text-[#EB001B]' />,
  },
  {
    key: 'unionpay',
    name: 'UnionPay',
    translated: true,
    logo: null,
  },
  {
    key: 'wechat',
    name: 'WeChat Pay',
    translated: true,
    logo: <SiWechat aria-hidden='true' className='size-3.5 text-[#07C160]' />,
  },
  {
    key: 'applepay',
    name: 'Apple Pay',
    logo: <SiApplepay aria-hidden='true' className='size-6 text-black' />,
  },
  {
    key: 'googlepay',
    name: 'Google Pay',
    logo: <SiGooglepay aria-hidden='true' className='size-6 text-[#4285F4]' />,
  },
]

const MORE_METHODS: AcceptedMethod[] = [
  {
    key: 'link',
    name: 'Link',
    logo: <span className={cn(TEXT_LOGO_CLASS, 'text-[#00A35C]')}>Link</span>,
  },
  {
    key: 'kakaopay',
    name: 'Kakao Pay',
    logo: (
      <span
        className={cn(
          TEXT_LOGO_CLASS,
          'rounded-sm bg-[#FFEB00] px-0.5 text-black'
        )}
      >
        pay
      </span>
    ),
  },
  {
    key: 'naverpay',
    name: 'Naver Pay',
    logo: <SiNaver aria-hidden='true' className='size-3 text-[#03C75A]' />,
  },
  {
    key: 'payco',
    name: 'PAYCO',
    logo: <span className={cn(TEXT_LOGO_CLASS, 'text-[#FA2828]')}>PAYCO</span>,
  },
  {
    key: 'samsungpay',
    name: 'Samsung Pay',
    logo: <SiSamsungpay aria-hidden='true' className='size-7 text-[#1428A0]' />,
  },
  {
    key: 'mbway',
    name: 'MB WAY',
    logo: <span className={cn(TEXT_LOGO_CLASS, 'text-[#D60510]')}>MB</span>,
  },
  {
    key: 'bancontact',
    name: 'Bancontact',
    logo: <span className={cn(TEXT_LOGO_CLASS, 'text-[#005498]')}>BC</span>,
  },
  {
    key: 'eps',
    name: 'EPS',
    logo: <span className={cn(TEXT_LOGO_CLASS, 'text-[#C8036F]')}>eps</span>,
  },
]

export function StripeAcceptedMethods(props: StripeAcceptedMethodsProps) {
  const { t } = useTranslation()
  const label = t('Stripe supports')
  const moreLabel = t('{{count}} more payment methods', {
    count: MORE_METHODS.length,
  })

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-1',
        props.className
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'text-muted-foreground mr-0.5 text-[11px]',
          props.labelClassName
        )}
      >
        {label}
      </span>
      <ul aria-label={label} className='contents'>
        {FEATURED_METHODS.map((method) => {
          const name = method.translated ? t(method.name) : method.name
          if (!method.logo) {
            return (
              <li
                key={method.key}
                className={cn(
                  CHIP_CLASS,
                  'text-[11px] leading-none font-semibold text-[#D7000F]'
                )}
              >
                {name}
              </li>
            )
          }
          return (
            <li key={method.key} className={CHIP_CLASS}>
              {method.logo}
              <span className='sr-only'>{name}</span>
            </li>
          )
        })}
      </ul>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              aria-label={moreLabel}
              className='text-muted-foreground hover:text-foreground h-5 rounded border border-black/10 bg-white px-1 text-[11px] font-semibold dark:border-white/15 dark:bg-transparent'
            />
          }
        >
          +{MORE_METHODS.length}
        </PopoverTrigger>
        <PopoverContent className='w-auto p-3'>
          <ul
            aria-label={moreLabel}
            className='grid grid-cols-2 gap-x-3 gap-y-2'
          >
            {MORE_METHODS.map((method) => (
              <li key={method.key} className='flex items-center gap-2 text-xs'>
                <span
                  aria-hidden='true'
                  className={cn(CHIP_CLASS, 'w-9 shrink-0')}
                >
                  {method.logo}
                </span>
                <span className='whitespace-nowrap'>{method.name}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
