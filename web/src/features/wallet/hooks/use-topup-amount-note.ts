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

import { useTypicalVideoCost } from '@/features/video-studio/hooks/use-typical-video-cost'
import {
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
} from '@/lib/currency'

/**
 * A line under a top-up amount: its value in the currency the balance is
 * shown in, when that differs from the one it is paid in, and about how many
 * videos it buys.
 */
export function useTopupAmountNote(units: {
  creditExchangeRate: number
  toUSD: (amount: number) => number
}) {
  const { t } = useTranslation()
  const video = useTypicalVideoCost()
  const options = { digitsLarge: 2, digitsSmall: 0, abbreviate: false }

  return (amount: number): string | undefined => {
    const usd = units.toUSD(amount)
    const paid = formatLocalCurrencyAmount(
      amount * units.creditExchangeRate,
      options
    )
    const shown = formatCurrencyFromUSD(usd, options)
    const parts: string[] = []
    if (shown !== paid) parts.push(`≈ ${shown}`)
    const videos = video ? Math.floor(usd / video.costUSD) : 0
    if (videos > 0) parts.push(t('about {{count}} videos', { count: videos }))
    return parts.length ? parts.join(' · ') : undefined
  }
}
