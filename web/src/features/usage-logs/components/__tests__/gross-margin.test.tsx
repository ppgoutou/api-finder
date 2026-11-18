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
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'

const queryClients: QueryClient[] = []

function makeLog(other: LogOtherData): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type: 2,
    content: '',
    username: 'user',
    token_name: 'token',
    model_name: 'video-test',
    quota: 1000,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 1,
    channel_name: 'channel',
    token_id: 1,
    group: 'default',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'req-1',
    upstream_request_id: '',
  }
}

function renderDetails(isAdmin: boolean, other: LogOtherData): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['status'], {}, { updatedAt: Date.now() + 60_000 })
  queryClients.push(queryClient)

  render(
    <QueryClientProvider client={queryClient}>
      <DetailsDialog
        log={makeLog(other)}
        isAdmin={isAdmin}
        isRoot={false}
        open
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )
}

const withMargin: LogOtherData = {
  admin_info: { gross_margin: { revenue_quota: 1000, supply_quota: 600 } },
}

afterEach(() => {
  for (const queryClient of queryClients) {
    queryClient.clear()
  }
  queryClients.length = 0
})

describe('usage log gross margin', () => {
  test('shows profit over revenue to admins', () => {
    renderDetails(true, withMargin)

    expect(screen.getByText('Supply cost')).toBeInTheDocument()
    expect(screen.getByText('Gross profit')).toBeInTheDocument()
    expect(
      screen.getByText(
        Intl.NumberFormat(undefined, {
          style: 'percent',
          maximumFractionDigits: 2,
        }).format(0.4)
      )
    ).toBeInTheDocument()
  })

  test('hides the margin from non-admin viewers', () => {
    renderDetails(false, withMargin)

    expect(screen.queryByText('Supply cost')).toBeNull()
    expect(screen.queryByText('Gross profit')).toBeNull()
  })

  test('shows no margin section when the log carries no supplier price', () => {
    renderDetails(true, {})

    expect(screen.queryByText('Supply cost')).toBeNull()
  })
})
