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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getPromoPopup } from '../api'
import {
  parsePromoPopup,
  selectPromoCards,
  toPromoDay,
} from '../lib/promo-popup'

export const PROMO_POPUP_QUERY_KEY = ['promo-popup'] as const

/** Today's promotion cards in the interface language; empty on failure. */
export function usePromoPopup() {
  const { i18n } = useTranslation()
  const { data } = useQuery({
    queryKey: PROMO_POPUP_QUERY_KEY,
    queryFn: getPromoPopup,
    staleTime: 60 * 1000,
    meta: { errorToast: false },
  })
  const settings = parsePromoPopup(data?.success ? data.data : '')
  return {
    dailyLimit: settings.dailyLimit,
    cards: selectPromoCards(
      settings,
      i18n.resolvedLanguage || i18n.language,
      toPromoDay(new Date())
    ),
  }
}
