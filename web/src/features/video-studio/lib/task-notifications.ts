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
import { NOTIFY_OFFER_KEY } from '../constants'

/** Whether the browser can be asked to show notifications. */
export function canOfferNotifications(): boolean {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission !== 'default') return false
  try {
    return window.localStorage.getItem(NOTIFY_OFFER_KEY) === null
  } catch {
    return false
  }
}

/** Remembers the answer, so the offer is made once per browser. */
export function closeNotificationOffer() {
  try {
    window.localStorage.setItem(NOTIFY_OFFER_KEY, 'answered')
  } catch {
    // Storage may be blocked; the offer comes back on the next visit.
  }
}

/** Shows a notification; false when the browser does not allow it. */
export function showTaskNotification(
  title: string,
  body: string,
  onClick: () => void
): boolean {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted') return false
  try {
    const notification = new Notification(title, { body })
    notification.onclick = () => {
      window.focus()
      notification.close()
      onClick()
    }
    return true
  } catch {
    // Chrome on Android only allows them from a service worker.
    return false
  }
}
