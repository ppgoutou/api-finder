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
import {
  SiApplepay,
  SiGooglepay,
  SiMastercard,
  SiVisa,
  SiWechat,
} from 'react-icons/si'

import { cn } from '@/lib/utils'

interface StripeAcceptedMethodsProps {
  className?: string
  /** Hides the visible "Stripe supports" label where the position says it. */
  labelClassName?: string
}

const CHIP_CLASS =
  'inline-flex h-5 items-center justify-center overflow-hidden rounded border border-black/10 bg-white px-1.5'

/**
 * Logos of the payment methods the Stripe checkout page offers. The list
 * mirrors what is enabled in the Stripe account; Stripe itself decides which
 * of them a given customer sees.
 */
export function StripeAcceptedMethods(props: StripeAcceptedMethodsProps) {
  const { t } = useTranslation()
  const label = t('Stripe supports')

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
        <li className={CHIP_CLASS}>
          <SiWechat aria-hidden='true' className='size-3.5 text-[#07C160]' />
          <span className='sr-only'>{t('WeChat Pay')}</span>
        </li>
        <li className={CHIP_CLASS}>
          <SiApplepay aria-hidden='true' className='size-6 text-black' />
          <span className='sr-only'>Apple Pay</span>
        </li>
        <li className={CHIP_CLASS}>
          <SiGooglepay aria-hidden='true' className='size-6 text-[#4285F4]' />
          <span className='sr-only'>Google Pay</span>
        </li>
        <li className={CHIP_CLASS}>
          <SiVisa aria-hidden='true' className='size-6 text-[#1A1F71]' />
          <span className='sr-only'>Visa</span>
        </li>
        <li className={CHIP_CLASS}>
          <SiMastercard aria-hidden='true' className='size-5 text-[#EB001B]' />
          <span className='sr-only'>Mastercard</span>
        </li>
        <li
          className={cn(
            CHIP_CLASS,
            'text-[11px] leading-none font-semibold text-[#D7000F]'
          )}
        >
          {t('UnionPay')}
        </li>
      </ul>
    </div>
  )
}
