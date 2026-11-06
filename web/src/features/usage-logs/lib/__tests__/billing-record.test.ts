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
import { describe, expect, test } from 'vitest'

import { formatLogQuota } from '@/lib/format'

import { getBillingAmount, getBillingDescription } from '../billing-record'

const t = (key: string) => key

function bonus(key: string) {
  return {
    content_parts: [{ key, params: { quota: '¥5.000000' } }],
  }
}

describe('billing record amount', () => {
  test('a consume log reduces the balance and a refund adds to it', () => {
    expect(getBillingAmount({ type: 2, quota: 500000 }, null)).toBe(
      `-${formatLogQuota(500000)}`
    )
    expect(getBillingAmount({ type: 6, quota: 500000 }, null)).toBe(
      `+${formatLogQuota(500000)}`
    )
  })

  test('a consume log that charged nothing carries no sign', () => {
    expect(getBillingAmount({ type: 2, quota: 0 }, null)).toBe(
      formatLogQuota(0)
    )
  })

  test('an online top-up shows the credited amount as a gain', () => {
    const other = {
      content_parts: [
        {
          key: 'Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}',
          params: { quota: '¥68.000000', amount: 68 },
        },
      ],
    }
    expect(getBillingAmount({ type: 1, quota: 0 }, other)).toBe('+¥68')
  })

  test('an administrator decrease stays negative', () => {
    const other = {
      op: {
        action: 'user.quota_subtract',
        params: { requested_quota: 500000 },
      },
    }
    expect(getBillingAmount({ type: 1, quota: 0 }, other)).toBe(
      `-${formatLogQuota(500000)}`
    )
  })

  test('a credited bonus counts while a pending or reversed rebate does not', () => {
    const amount = (key: string) =>
      getBillingAmount({ type: 4, quota: 0 }, bonus(key))
    expect(amount('New user sign-up bonus {{quota}}')).toBe('+¥5')
    expect(amount('Invitation rebate {{quota}} moved to balance')).toBe('+¥5')
    expect(
      amount(
        'Invitation rebate {{quota}} earned, it reaches your balance on {{date}}'
      )
    ).toBeNull()
    expect(
      amount(
        "Invitation rebate {{quota}} reversed because the invitee's payment was refunded or disputed"
      )
    ).toBeNull()
  })

  test('a top-up log with no known amount shows none', () => {
    const other = {
      content_parts: [
        {
          key: 'Subscription purchased with balance, plan: {{plan}}, payment amount: {{amount}}, quota deducted: {{quota}}',
          params: { plan: 'Pro', amount: 10, quota: '¥10' },
        },
      ],
    }
    expect(getBillingAmount({ type: 1, quota: 0 }, other)).toBeNull()
  })
})

describe('billing record note', () => {
  const base = { model_name: 'gpt-4o', content: 'raw text' }

  test('a charge names the model', () => {
    expect(getBillingDescription({ ...base, type: 2 }, null, t)).toBe('gpt-4o')
  })

  test('a refund names the model and its reason', () => {
    expect(
      getBillingDescription({ ...base, type: 6 }, { reason: 'Timed out' }, t)
    ).toBe('gpt-4o · Timed out')
    expect(getBillingDescription({ ...base, type: 6 }, null, t)).toBe(
      'gpt-4o · Async task refund'
    )
  })

  test('a bonus keeps its log text', () => {
    expect(
      getBillingDescription(
        { model_name: '', content: '', type: 4 },
        { content_parts: [{ key: 'Daily check-in, received {{quota}}' }] },
        t
      )
    ).toBe('Daily check-in, received {{quota}}')
  })
})
