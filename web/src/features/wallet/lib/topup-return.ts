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
/** What the page knew before sending the user to pay. */
interface TopupStart {
  /** Wallet quota before the payment. */
  quota: number
  /** Unix milliseconds. */
  at: number
}

const STORAGE_KEY = 'wallet:topup-start'
/** Past this, a return is no longer taken for this payment. */
const START_LIFETIME_MS = 2 * 60 * 60 * 1000

/** Remembers the balance before the user leaves to pay. */
export function rememberTopupStart(quota: number) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ quota, at: Date.now() })
    )
  } catch {
    // Without storage the return page cannot tell what arrived; it still
    // shows the balance.
  }
}

/** The balance before the payment, when the user left to pay recently. */
export function readTopupStart(now: number): TopupStart | null {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? 'null'
    )
    if (!parsed || typeof parsed !== 'object') return null
    const start = parsed as TopupStart
    if (typeof start.quota !== 'number' || typeof start.at !== 'number') {
      return null
    }
    return now - start.at < START_LIFETIME_MS ? start : null
  } catch {
    return null
  }
}

export function clearTopupStart() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}
