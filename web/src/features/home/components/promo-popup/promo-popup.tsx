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
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { usePromoPopup } from '../../hooks/use-promo-popup'
import {
  dismissPromoPopupForDay,
  isPromoPopupSuppressed,
  recordPromoPopupView,
  toPromoDay,
} from '../../lib/promo-popup'

const PromoDialog = lazy(() =>
  import('./promo-dialog').then((module) => ({ default: module.PromoDialog }))
)

/** Opens the promotion popup up to the daily limit of this browser. */
export function PromoPopup() {
  const popup = usePromoPopup()
  const hasCards = popup.cards.length > 0
  const decided = useRef(false)
  const [shown, setShown] = useState(false)
  const [closed, setClosed] = useState(false)

  // Decide once per visit, so a settings refetch can't reopen or recount it.
  useEffect(() => {
    if (decided.current || !hasCards) return
    decided.current = true
    const today = toPromoDay(new Date())
    if (isPromoPopupSuppressed(today, popup.dailyLimit)) return
    recordPromoPopupView(today)
    setShown(true)
  }, [hasCards, popup.dailyLimit])

  if (!shown || !hasCards) return null

  return (
    <Suspense fallback={null}>
      <PromoDialog
        open={!closed}
        cards={popup.cards}
        onClose={() => setClosed(true)}
        onDismissToday={() => dismissPromoPopupForDay(toPromoDay(new Date()))}
      />
    </Suspense>
  )
}
