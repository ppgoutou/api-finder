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
type AnalyticsParams = Record<string, string | number | boolean>

type GtagWindow = Window & {
  gtag?: (command: 'event', name: string, params?: AnalyticsParams) => void
}

/**
 * Sends a GA4 event through the gtag snippet in index.html. Does nothing when
 * the tag is missing or blocked, so callers never need to guard it.
 */
export function trackEvent(name: string, params?: AnalyticsParams): void {
  try {
    ;(window as GtagWindow).gtag?.('event', name, params)
  } catch {
    // Analytics must never break the page.
  }
}
