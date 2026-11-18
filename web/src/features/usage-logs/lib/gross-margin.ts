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
import type { LogOtherData } from '../types'

export type GrossMargin = {
  /** The whole charge the log stands for; a task's total, not a difference. */
  revenueQuota: number
  /** The supplier price of that charge. */
  supplyQuota: number
  profitQuota: number
  /** Profit over revenue, in percent. */
  percent: number
}

/**
 * Reads the admin-only gross margin of a log. Log owners never receive
 * admin_info, and callers still gate on the admin role.
 */
export function getGrossMargin(
  other: LogOtherData | null | undefined
): GrossMargin | null {
  const margin = other?.admin_info?.gross_margin
  if (!margin) return null
  const revenueQuota = Number(margin.revenue_quota)
  const supplyQuota = Number(margin.supply_quota)
  if (
    !Number.isFinite(revenueQuota) ||
    !Number.isFinite(supplyQuota) ||
    revenueQuota <= 0 ||
    supplyQuota < 0
  ) {
    return null
  }
  const profitQuota = revenueQuota - supplyQuota
  return {
    revenueQuota,
    supplyQuota,
    profitQuota,
    percent: (profitQuota / revenueQuota) * 100,
  }
}
