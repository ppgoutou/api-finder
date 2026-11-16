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

/** Turns every PX Show partner link on or off in one place. */
export const PX_SHOW_LINKS_ENABLED = true

/** Where on this site a PX Show link sits, sent as utm_medium. */
export type PxShowPlacement = 'studio' | 'home-use-cases'

/** PX Show homepage tagged with this site as the source and the placement. */
export function pxShowUrl(placement: PxShowPlacement): string {
  const params = new URLSearchParams({
    utm_source: 'api-finder',
    utm_medium: placement,
    utm_campaign: 'partner',
  })
  return `https://www.pxshow.com/?${params}`
}
