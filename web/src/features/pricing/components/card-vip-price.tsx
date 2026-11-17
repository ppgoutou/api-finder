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

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CardVipSavingProps {
  /** Price before the VIP saving, already formatted. */
  standardPrice: string
  savingPercent: number
}

/** Beside a card's VIP headline: the standard price it replaces. */
export function CardVipSaving(props: CardVipSavingProps) {
  const { t } = useTranslation()
  return (
    <span className='inline-flex items-center gap-1.5 pb-0.5 text-xs'>
      <span className='sr-only'>{t('Standard price')}</span>
      <s className='text-muted-foreground font-mono tabular-nums'>
        {props.standardPrice}
      </s>
      <span className='rounded-full bg-amber-700 px-1.5 py-px font-semibold text-amber-50 dark:bg-amber-500 dark:text-amber-950'>
        {t('Save {{percent}}%', { percent: props.savingPercent })}
      </span>
    </span>
  )
}

interface CardVipToggleProps {
  /** Whether the card currently shows VIP prices. */
  showVip: boolean
  onShowVipChange: (showVip: boolean) => void
}

/**
 * Switches a card between standard and VIP prices. The button names the
 * group it switches to: "VIP" while standard prices show, "default" while
 * VIP prices show.
 */
export function CardVipToggle(props: CardVipToggleProps) {
  const { t } = useTranslation()
  return (
    <Button
      type='button'
      size='xs'
      aria-pressed={props.showVip}
      aria-label={
        props.showVip ? t('Show standard prices') : t('Show VIP prices')
      }
      onClick={() => props.onShowVipChange(!props.showVip)}
      className={cn(
        'shrink-0 rounded-full px-2.5 font-semibold',
        props.showVip
          ? 'border-brand/40 bg-card text-brand hover:bg-brand-soft border'
          : 'bg-amber-700 text-amber-50 hover:bg-amber-800 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400'
      )}
    >
      {/* Group names, shown as is in every language. */}
      {props.showVip ? 'default' : 'VIP'}
    </Button>
  )
}
