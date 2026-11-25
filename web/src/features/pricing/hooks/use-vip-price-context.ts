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
import { useMemo } from 'react'

import { useMembership } from '@/features/membership'

import type { VipPriceContext } from '../lib/vip-price'

/** VIP pricing for the viewer; undefined while VIP is off or unknown. */
export function useVipPriceContext(): VipPriceContext | undefined {
  const { data: membership } = useMembership()
  return useMemo(() => {
    if (!membership?.enabled || !membership.vip_pairs?.length) return undefined
    return {
      pairs: membership.vip_pairs.map((pair) => ({
        baseGroup: pair.base_group,
        vipGroup: pair.vip_group,
        baseRatio: pair.base_ratio,
        vipRatio: pair.vip_ratio,
      })),
      viewerVipGroup: membership.vip_group ?? '',
      isVip: membership.is_vip === true,
    }
  }, [membership])
}
