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
import { t } from 'i18next'
import { describe, expect, it } from 'vitest'

import { getVipBenefits, getVipUpgradeRule } from '../lib/benefits'
import type { MembershipInfo } from '../types'

const base: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 0,
  single_threshold_quota: 0,
  vip_price_rate: 0.85,
  standard_concurrency: 10,
  vip_concurrency: 100,
  signed_in: false,
}

describe('VIP benefits', () => {
  it('lists the price, concurrency and line benefits when VIP is cheaper and both concurrencies are set', () => {
    const ids = getVipBenefits(base, t).map((benefit) => benefit.id)

    expect(ids.slice(0, 3)).toEqual(['price', 'concurrency', 'lines'])
  })

  it('drops the price row when the VIP group is not cheaper', () => {
    const ids = getVipBenefits({ ...base, vip_price_rate: 1 }, t).map(
      (benefit) => benefit.id
    )

    expect(ids).not.toContain('price')
    expect(ids[0]).toBe('concurrency')
  })

  it('drops the concurrency row when either figure is 0', () => {
    const ids = getVipBenefits({ ...base, standard_concurrency: 0 }, t).map(
      (benefit) => benefit.id
    )

    expect(ids).not.toContain('concurrency')
  })

  it('puts both concurrency figures in the comparison cells', () => {
    const row = getVipBenefits(base, t).find(
      (benefit) => benefit.id === 'concurrency'
    )

    expect(row?.standard).toBe('About 10 tasks at once')
    expect(row?.vip).toBe('About 100 tasks at once')
  })
})

describe('VIP upgrade rule', () => {
  it('names neither threshold when both are off', () => {
    expect(getVipUpgradeRule(base, t)).toBeNull()
  })

  it('names the total threshold alone when only it is on', () => {
    const rule = getVipUpgradeRule(
      { ...base, total_threshold_quota: 500_000_000 },
      t
    )

    expect(rule).toMatch(/^Top up .+ in total$/)
  })

  it('names both thresholds when both are on', () => {
    const rule = getVipUpgradeRule(
      {
        ...base,
        total_threshold_quota: 500_000_000,
        single_threshold_quota: 250_000_000,
      },
      t
    )

    expect(rule).toMatch(/^Top up .+ in total or .+ at once$/)
  })
})
