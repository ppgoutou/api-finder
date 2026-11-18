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
import { getVipSavingPercent } from '../lib/progress'
import { useMembership } from './use-membership'

/**
 * The VIP price as a share of what this viewer pays now, for showing a viewer
 * who is not VIP yet what VIP would cost; null for VIP members, while the
 * program is off, or when VIP is not cheaper.
 */
export function useVipUpsellRate(): number | null {
  const { data: info } = useMembership()
  if (!info?.enabled || info.is_vip) return null
  if (getVipSavingPercent(info) <= 0) return null
  return info.vip_price_rate
}
