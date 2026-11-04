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
import { lazy, Suspense, useEffect, useState } from 'react'

import { usePromoCards } from '../../hooks/use-promo-popup'
import {
  dismissPromoPopupForDay,
  isPromoPopupSuppressed,
  markPromoPopupSeen,
  toPromoDay,
} from '../../lib/promo-popup'

const PromoDialog = lazy(() =>
  import('./promo-dialog').then((module) => ({ default: module.PromoDialog }))
)

/** Opens the promotion popup once per tab unless dismissed for today. */
export function PromoPopup() {
  const cards = usePromoCards()
  const [suppressed] = useState(() =>
    isPromoPopupSuppressed(toPromoDay(new Date()))
  )
  const [closed, setClosed] = useState(false)
  const shouldShow = !suppressed && cards.length > 0

  useEffect(() => {
    if (shouldShow) markPromoPopupSeen()
  }, [shouldShow])

  if (!shouldShow) return null

  return (
    <Suspense fallback={null}>
      <PromoDialog
        open={!closed}
        cards={cards}
        onClose={() => setClosed(true)}
        onDismissToday={() => dismissPromoPopupForDay(toPromoDay(new Date()))}
      />
    </Suspense>
  )
}
