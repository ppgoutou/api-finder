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
import { Link } from '@tanstack/react-router'
import { Check, ChevronRight, Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

interface CardVipSavingProps {
  /** Price before the VIP saving, already formatted. */
  standardPrice: string
  savingPercent: number
}

/**
 * Beside a card's VIP headline: the standard price it replaces, struck
 * through as it appears, and the saving.
 */
export function CardVipSaving(props: CardVipSavingProps) {
  const { t } = useTranslation()
  return (
    <span className='inline-flex items-center gap-1.5 pb-0.5 text-xs'>
      <span className='sr-only'>{t('Standard price')}</span>
      <s className='vip-strike text-muted-foreground font-mono tabular-nums no-underline'>
        {props.standardPrice}
      </s>
      <span className='vip-save-pop bg-vip text-vip-foreground rounded-full px-1.5 py-px font-semibold'>
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

const SEGMENT_CLASS =
  'relative z-10 h-5 min-w-0 gap-1 rounded-full! px-2.5 text-micro font-semibold text-muted-foreground transition-colors duration-200 hover:bg-transparent hover:text-foreground aria-pressed:bg-transparent [&_svg:not([class*=size-])]:size-3'

/**
 * Switches a card between standard and VIP prices. Both choices stay named;
 * a sliding thumb in brand blue or VIP gold marks the one in use.
 */
export function CardVipToggle(props: CardVipToggleProps) {
  const { t } = useTranslation()
  const selected = props.showVip ? 'vip' : 'standard'
  return (
    <ToggleGroup
      aria-label={t('Price view')}
      value={[selected]}
      onValueChange={(values) => {
        // Pressing the segment in use again clears the value; keep it.
        if (values.length === 0) return
        props.onShowVipChange(values[0] === 'vip')
      }}
      className={cn(
        'bg-card relative grid shrink-0 grid-cols-2 rounded-full border p-0.5 transition-colors duration-300',
        props.showVip ? 'border-vip/40' : 'border-brand/30'
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full shadow-xs transition-[translate,background-color] duration-300 ease-out motion-reduce:transition-none',
          props.showVip ? 'bg-vip translate-x-full' : 'bg-brand'
        )}
      />
      <ToggleGroupItem
        value='standard'
        className={cn(SEGMENT_CLASS, !props.showVip && 'text-white!')}
      >
        {t('Standard')}
      </ToggleGroupItem>
      <ToggleGroupItem
        value='vip'
        className={cn(SEGMENT_CLASS, props.showVip && 'text-vip-foreground!')}
      >
        <Crown aria-hidden='true' />
        {/* The membership name, shown as is in every language. */}
        VIP
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

interface CardVipPanelGlowProps {
  showVip: boolean
  /** Changes each time the viewer switches this card to VIP. */
  shineKey: number
}

/**
 * The gold layer behind a price panel showing VIP prices, and the one light
 * sweep across it when the viewer switches to them.
 */
export function CardVipPanelGlow(props: CardVipPanelGlowProps) {
  return (
    <>
      <span
        aria-hidden='true'
        className={cn(
          'from-vip-soft/40 via-vip-soft/70 to-vip-soft pointer-events-none absolute inset-0 -z-10 bg-linear-to-br transition-opacity duration-300',
          props.showVip ? 'opacity-100' : 'opacity-0'
        )}
      />
      {props.showVip && props.shineKey > 0 && (
        <span
          key={props.shineKey}
          aria-hidden='true'
          className='vip-panel-shine pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-2/5'
        />
      )}
    </>
  )
}

interface CardVipFootnoteProps {
  /** Whether the viewer already gets VIP prices. */
  isVip: boolean
}

/** Under VIP prices: the viewer's own price, or the way to get it. */
export function CardVipFootnote(props: CardVipFootnoteProps) {
  const { t } = useTranslation()
  if (props.isVip) {
    return (
      <span className='vip-footnote-in text-vip col-span-full flex items-center gap-1 text-xs font-semibold'>
        <Check aria-hidden='true' className='size-3.5' />
        {t('Your price')}
      </span>
    )
  }
  return (
    <Link
      to='/vip'
      onClick={(event) => event.stopPropagation()}
      className='vip-footnote-in text-vip col-span-full flex w-fit items-center gap-0.5 text-xs font-semibold hover:underline'
    >
      {t('Join VIP to get this price')}
      <ChevronRight aria-hidden='true' className='size-3.5' />
    </Link>
  )
}
