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
// The night look's typefaces; their files load only where they are used.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'

/** The gold fill of VIP buttons and chips, readable in both themes. */
export const VIP_GOLD_FILL =
  'bg-amber-700 text-amber-50 hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300'

/** Gold text on the page background, such as VIP prices. */
export const VIP_GOLD_TEXT = 'text-amber-700 dark:text-amber-300'

/** The soft gold panel behind VIP banners and highlighted cells. */
export const VIP_GOLD_SURFACE =
  'border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-orange-400/10'

/*
 * The night look of the VIP page and the compare dialog: a near-black stage,
 * Inter for text, Space Grotesk for display figures and a lime accent. The
 * `dark` class switches the theme tokens of everything inside to dark.
 */
export const VIP_NIGHT_STAGE =
  "dark bg-[#0d0e10] font-[family-name:'Inter_Variable','PingFang_SC','Microsoft_YaHei',ui-sans-serif,sans-serif] text-white"

/** Large figures and headlines on the night stage. */
export const VIP_DISPLAY_FONT =
  "font-[family-name:'Space_Grotesk_Variable','PingFang_SC','Microsoft_YaHei',ui-sans-serif,sans-serif] font-bold tracking-[-0.03em] uppercase"

/** The lime call-to-action fill. */
export const VIP_LIME_FILL =
  'bg-[#d1fe17] text-[#111214] hover:bg-[#c3f000] focus-visible:ring-[#d1fe17]/50'

/** Lime text, such as VIP values and checks. */
export const VIP_LIME_TEXT = 'text-[#d1fe17]'

/** A glassy panel on the night stage. */
export const VIP_NIGHT_PANEL =
  'border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
