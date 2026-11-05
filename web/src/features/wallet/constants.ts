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
// ============================================================================
// Wallet Constants
// ============================================================================

/** Outlined raised surface shared by the wallet page's cards. */
export const WALLET_SURFACE_CLASS =
  'border-foreground/25 hover:border-brand shadow-[0_1px_2px_rgb(11_18_32/0.04),0_8px_24px_rgb(11_18_32/0.05)] transition-[border-color,box-shadow] duration-200 hover:shadow-[0_12px_28px_rgb(11_18_32/0.12)]'

/** Removes the divider and tightens the header of a wallet TitledCard. */
export const WALLET_CARD_HEADER_CLASS = 'border-b-0 p-4 !pb-0 sm:p-6 sm:!pb-0'

/** Quiet text action in a wallet card header, such as the order history. */
export const WALLET_HEADER_ACTION_CLASS =
  'text-muted-foreground hover:text-foreground h-auto px-0 py-0.5 font-normal hover:bg-transparent'

/**
 * Default preset amount multipliers
 * Used to generate quick select amounts based on minimum topup
 */
export const DEFAULT_PRESET_MULTIPLIERS = [1, 5, 10, 30, 50, 100, 300, 500]

/**
 * Payment method types
 */
export const PAYMENT_TYPES = {
  ALIPAY: 'alipay',
  WECHAT: 'wxpay',
  STRIPE: 'stripe',
  CREEM: 'creem',
  WAFFO: 'waffo',
  WAFFO_PANCAKE: 'waffo_pancake',
  USDT: 'usdt',
} as const

/**
 * Default payment type
 */
export const DEFAULT_PAYMENT_TYPE = PAYMENT_TYPES.ALIPAY

/**
 * Payment icon colors (HEX format for react-icons)
 */
export const PAYMENT_ICON_COLORS = {
  [PAYMENT_TYPES.ALIPAY]: '#1677FF',
  [PAYMENT_TYPES.WECHAT]: '#07C160',
  [PAYMENT_TYPES.STRIPE]: '#635BFF',
  [PAYMENT_TYPES.CREEM]: '#6366F1',
  [PAYMENT_TYPES.WAFFO]: '#2563EB',
  [PAYMENT_TYPES.WAFFO_PANCAKE]: '#F97316',
  [PAYMENT_TYPES.USDT]: '#26A17B',
} as const

/**
 * Default discount rate (no discount)
 */
export const DEFAULT_DISCOUNT_RATE = 1.0

/**
 * Default minimum topup amount
 */
export const DEFAULT_MIN_TOPUP = 1

/** Where buyers look up their redemption-code orders in the card shop. */
export const REDEMPTION_ORDERS_URL = 'https://wzyp.cn/order'
