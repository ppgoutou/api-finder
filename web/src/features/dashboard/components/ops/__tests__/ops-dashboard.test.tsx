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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getOpsDashboard } from '../../../api'
import type { OpsDashboardData, OpsPeriodStats } from '../../../types'
import { OpsDashboard } from '../ops-dashboard'

vi.mock('../../../api', () => ({ getOpsDashboard: vi.fn() }))
vi.mock('../ops-chart', () => ({ OpsChart: () => null }))

const emptyPeriod: OpsPeriodStats = {
  topup_quota: 0,
  topup_orders: 0,
  refund_quota: 0,
  refund_orders: 0,
  disputed_orders: 0,
  closed_orders: 0,
  new_users: 0,
  payers: 0,
  new_payers: 0,
  active_users: 0,
  used_quota: 0,
  other_credit_quota: 0,
  test_credit_quota: 0,
}

const emptyDashboard: OpsDashboardData = {
  current: emptyPeriod,
  previous: emptyPeriod,
  wallet: {
    topup_quota: 0,
    all_channels_quota: 0,
    used_quota: 0,
    balance_quota: 0,
    negative_users: 0,
    negative_quota: 0,
    other_credit: { redemption_quota: 0, rebate_quota: 0, checkin_quota: 0 },
    recent_used_quota: 0,
    recent_used_seconds: 604800,
    test_credit: { granted_quota: 0, used_quota: 0, users: 0 },
  },
  users: { registered: 0, total_payers: 0, repeat_payers: 0, dormant: 0 },
  pending: { pending: 0, overdue: 0 },
  channels: [],
  trend: [],
  models: [],
  model_perf: [],
  tasks: {
    success: 0,
    failure: 0,
    in_progress: 0,
    queued: 0,
    fail_reasons: [],
  },
  upstream: [],
  top_users: [],
  alerts: {
    overdue_orders: 0,
    usdt_exceptions: 0,
    disputed_orders: 0,
    low_balance_channels: 0,
  },
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpsDashboard />
    </QueryClientProvider>
  )
}

function lastRequest() {
  return vi.mocked(getOpsDashboard).mock.lastCall?.[0]
}

async function waitForRequests(count: number) {
  await waitFor(() => {
    expect(getOpsDashboard).toHaveBeenCalledTimes(count)
  })
}

describe('OpsDashboard date range', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 6, 10, 0, 0))
    vi.mocked(getOpsDashboard).mockReset()
    vi.mocked(getOpsDashboard).mockResolvedValue({
      success: true,
      data: emptyDashboard,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('reaches the present when refreshed on a page that stayed open', async () => {
    renderDashboard()
    await waitForRequests(1)
    await screen.findByText('Wallet')

    vi.setSystemTime(new Date(2026, 10, 6, 11, 0, 0))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitForRequests(2)

    expect(lastRequest()?.end_timestamp).toBe(
      new Date(2026, 10, 6, 11, 0, 0).getTime() / 1000
    )
  })

  it('reaches the present when another range is picked later', async () => {
    renderDashboard()
    await waitForRequests(1)

    vi.setSystemTime(new Date(2026, 10, 6, 11, 0, 0))
    await userEvent.click(screen.getByRole('tab', { name: 'Today' }))
    await waitForRequests(2)

    expect(lastRequest()).toMatchObject({
      start_timestamp: new Date(2026, 10, 6).getTime() / 1000,
      end_timestamp: new Date(2026, 10, 6, 11, 0, 0).getTime() / 1000,
    })
  })

  it('asks for dates instead of showing another period for an empty custom range', async () => {
    renderDashboard()
    await waitForRequests(1)
    await screen.findByText('Wallet')

    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }))

    expect(
      await screen.findByText('Select a start and end date to see the figures')
    ).toBeTruthy()
    expect(screen.queryByText('Wallet')).toBeNull()
    expect(getOpsDashboard).toHaveBeenCalledTimes(1)
  })
})
