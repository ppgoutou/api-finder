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
import type { MembershipInfo } from '../types'

export interface MembershipProgress {
  /** Share of the total threshold reached, 0 to 100. */
  percent: number
  /** Paid quota still missing to reach the total threshold. */
  remainingQuota: number
}

/** How far a user's paid top-ups are from the total VIP threshold. */
export function getMembershipProgress(
  info: MembershipInfo
): MembershipProgress {
  const threshold = info.total_threshold_quota
  const paid = info.paid_total_quota ?? 0
  if (threshold <= 0) return { percent: 0, remainingQuota: 0 }
  return {
    percent: Math.min(100, Math.max(0, (paid / threshold) * 100)),
    remainingQuota: Math.max(0, threshold - paid),
  }
}

/** Whole-percent saving VIP prices give, or 0 when they are not cheaper. */
export function getVipSavingPercent(info: MembershipInfo): number {
  const rate = info.vip_price_rate
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return 0
  return Math.round((1 - rate) * 100)
}
