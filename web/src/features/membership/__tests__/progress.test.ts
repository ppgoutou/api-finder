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
import { describe, expect, it } from 'vitest'

import { getMembershipProgress, getVipSavingPercent } from '../lib/progress'
import type { MembershipInfo } from '../types'

const base: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 1000,
  single_threshold_quota: 500,
  vip_price_rate: 0.85,
  signed_in: true,
}

describe('membership progress', () => {
  it('reports the share reached and the amount still missing', () => {
    expect(getMembershipProgress({ ...base, paid_total_quota: 250 })).toEqual({
      percent: 25,
      remainingQuota: 750,
    })
  })

  it('caps progress at 100 once the threshold is passed', () => {
    expect(getMembershipProgress({ ...base, paid_total_quota: 1500 })).toEqual({
      percent: 100,
      remainingQuota: 0,
    })
  })

  it('treats a missing paid total as nothing paid', () => {
    expect(getMembershipProgress(base).remainingQuota).toBe(1000)
  })

  it('reports no progress when the total rule is off', () => {
    expect(
      getMembershipProgress({ ...base, total_threshold_quota: 0 })
    ).toEqual({ percent: 0, remainingQuota: 0 })
  })
})

describe('VIP saving percent', () => {
  it.each([
    [0.85, 15],
    [0.9, 10],
    [0.333, 67],
  ])('turns a price rate of %s into %s percent off', (rate, percent) => {
    expect(getVipSavingPercent({ ...base, vip_price_rate: rate })).toBe(percent)
  })

  it.each([1, 1.2, 0, Number.NaN])(
    'shows no saving for a price rate of %s',
    (rate) => {
      expect(getVipSavingPercent({ ...base, vip_price_rate: rate })).toBe(0)
    }
  )
})
