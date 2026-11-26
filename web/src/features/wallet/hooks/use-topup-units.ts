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
import { useSystemConfig } from '@/hooks/use-system-config'

/**
 * How top-up amounts are entered and shown. With quota shown in yuan,
 * amounts are entered in yuan and Stripe and USDT convert them to USD;
 * otherwise they are dollars.
 */
export function useTopupUnits() {
  const { currency } = useSystemConfig()
  const amountsInCNY = currency?.quotaDisplayType === 'CNY'
  const usdExchangeRate = currency?.usdExchangeRate || 1
  // An entered amount times this is the credit in the display currency.
  const creditExchangeRate =
    amountsInCNY || currency?.quotaDisplayType === 'USD' ? 1 : usdExchangeRate
  let amountUnit: 'USD' | 'CNY' | undefined = 'USD'
  if (amountsInCNY) amountUnit = 'CNY'
  if (currency?.quotaDisplayType === 'TOKENS') amountUnit = undefined
  return {
    amountsInCNY,
    creditExchangeRate,
    amountUnit,
    /** The credit an entered amount buys, in USD. */
    toUSD: (amount: number) =>
      amountsInCNY ? amount / usdExchangeRate : amount,
  }
}
