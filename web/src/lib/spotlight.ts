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
import type { PointerEvent } from 'react'

/**
 * Pointer handler for a `.spotlight-group`: tells every `.spotlight-card`
 * inside where the pointer is, relative to that card, so the light in
 * index.css follows it across neighbouring cards.
 */
export function trackSpotlight(event: PointerEvent<HTMLElement>): void {
  const cards =
    event.currentTarget.querySelectorAll<HTMLElement>('.spotlight-card')
  for (const card of cards) {
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
    card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
  }
}
