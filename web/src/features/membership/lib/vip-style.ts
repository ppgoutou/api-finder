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
/**
 * The VIP gradient fill of buttons and chips: brand blue into violet, the
 * same in both themes.
 */
export const VIP_FILL =
  'bg-linear-135 from-vip-from to-vip-to text-white hover:from-vip-from-hover hover:to-vip-to-hover'

/** Violet text on the page background, such as VIP prices. */
export const VIP_TEXT = 'text-vip'

/** The soft violet panel behind VIP banners and highlighted cells. */
export const VIP_SURFACE =
  'border-vip/30 bg-gradient-to-r from-vip/15 via-vip/10 to-vip/5'

/*
 * The night look of the VIP page and the compare dialog: a deep indigo stage,
 * the site font for text, Space Grotesk for display figures and a violet
 * accent. The `dark` class switches the theme tokens of everything inside to
 * dark.
 */
export const VIP_NIGHT_STAGE = 'dark bg-night text-white'

/** Large figures and headlines on the night stage. */
export const VIP_DISPLAY_FONT = 'font-display font-bold tracking-[-0.03em]'

/** The call-to-action fill on the night stage: the VIP gradient. */
export const VIP_NIGHT_FILL = `${VIP_FILL} focus-visible:ring-accent-night/50`

/** Violet text on the night stage, such as VIP values and checks. */
export const VIP_NIGHT_TEXT = 'text-accent-night'

/** A glassy panel on the night stage. */
export const VIP_NIGHT_PANEL =
  'border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
