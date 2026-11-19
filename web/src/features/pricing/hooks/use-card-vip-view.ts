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
import { useEffect, useState, type RefObject } from 'react'

import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'

/** Delay per pixel between the switched card and a card that follows it. */
const RIPPLE_MS_PER_PX = 0.2
/** The farthest card still follows within this time. */
const RIPPLE_MAX_DELAY_MS = 600

export interface CardVipView {
  /** Whether the card shows VIP prices right now. */
  showVip: boolean
  /** Changes each time the viewer's switch turns this card to VIP. */
  shineKey: number
}

/**
 * The price view a card shows. The card the viewer switched follows the
 * switch at once; every other card follows a moment later, the farther
 * away the later, so the change spreads out from the switched card.
 */
export function useCardVipView(
  showVip: boolean,
  modelName: string,
  cardRef: RefObject<HTMLElement | null>
): CardVipView {
  const origin = usePricingPreferencesStore((state) => state.vipSwitchOrigin)
  const [shown, setShown] = useState(showVip)
  const [prevShown, setPrevShown] = useState(shown)
  const [shineKey, setShineKey] = useState(0)
  const followsAtOnce = origin === null || origin.modelName === modelName

  if (shown !== showVip && followsAtOnce) setShown(showVip)
  if (prevShown !== shown) {
    setPrevShown(shown)
    if (shown && origin !== null) setShineKey((key) => key + 1)
  }

  useEffect(() => {
    if (shown === showVip || followsAtOnce) return
    const rect = cardRef.current?.getBoundingClientRect()
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    let delay = 0
    if (rect && origin && !reduceMotion) {
      const distance = Math.hypot(
        rect.left + rect.width / 2 - origin.x,
        rect.top + rect.height / 2 - origin.y
      )
      delay = Math.min(RIPPLE_MAX_DELAY_MS, distance * RIPPLE_MS_PER_PX)
    }
    const timer = window.setTimeout(() => setShown(showVip), delay)
    return () => window.clearTimeout(timer)
  }, [showVip, shown, followsAtOnce, origin, cardRef])

  return { showVip: shown, shineKey }
}
