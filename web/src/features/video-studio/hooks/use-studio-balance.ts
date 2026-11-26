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
import { useQuery } from '@tanstack/react-query'

import { getSelf } from '@/lib/api'
import { getCurrencyDisplay } from '@/lib/currency'

import { STUDIO_BALANCE_QUERY_KEY } from '../constants'

interface StudioBalance {
  /** How much the wallet lacks for the cost in USD, or null when it is enough or unknown. */
  shortfallUSD: number | null
  /** The wallet balance in quota, or null while it is unknown. */
  quota: number | null
  /** Re-read the wallet, such as after a submission spent from it. */
  refresh: () => void
}

/** Compares an estimated charge with the viewer's current wallet balance. */
export function useStudioBalance(costUSD: number | null): StudioBalance {
  const query = useQuery({
    queryKey: STUDIO_BALANCE_QUERY_KEY,
    queryFn: async () => {
      const response = await getSelf()
      const quota = response?.data?.quota
      return typeof quota === 'number' ? quota : null
    },
    meta: { errorToast: false },
  })
  const quota = query.data ?? null
  const refresh = () => {
    void query.refetch()
  }
  if (quota === null || costUSD === null) {
    return { shortfallUSD: null, quota, refresh }
  }

  const balanceUSD = quota / getCurrencyDisplay().config.quotaPerUnit
  const shortfallUSD = costUSD - balanceUSD
  return {
    shortfallUSD: shortfallUSD > 0 ? shortfallUSD : null,
    quota,
    refresh,
  }
}
