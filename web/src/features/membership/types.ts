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
/** A standard group and its VIP group, ratios on /api/pricing's scale. */
export interface MembershipVipPair {
  base_group: string
  vip_group: string
  base_ratio: number
  vip_ratio: number
}

export interface MembershipInfo {
  /** Whether automatic VIP upgrades are on and the VIP group exists. */
  enabled: boolean
  /** Paid quota in total that makes a user VIP; 0 turns the rule off. */
  total_threshold_quota: number
  /** Quota in one top-up or code that makes a user VIP; 0 turns it off. */
  single_threshold_quota: number
  /** VIP price as a share of the standard price, 1 when not cheaper. */
  vip_price_rate: number
  /** The viewer's standard group, or the main one for everyone else. */
  base_group?: string
  /** The VIP group that standard group moves to. */
  vip_group?: string
  /** That VIP group's ratio on /api/pricing's scale; 0 when off. */
  vip_display_group_ratio?: number
  /** Every standard-to-VIP pair, the main pair first. */
  vip_pairs?: MembershipVipPair[]
  signed_in: boolean
  is_vip?: boolean
  paid_total_quota?: number
  paid_single_quota?: number
  /** Telegram handle for VIP support, only sent to VIP users. */
  vip_support_telegram?: string
}

export interface MembershipResponse {
  success: boolean
  message?: string
  data: MembershipInfo
}
