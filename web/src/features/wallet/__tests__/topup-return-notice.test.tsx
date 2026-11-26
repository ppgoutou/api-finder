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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSelf } from '@/lib/api'

import { TopupReturnNotice } from '../components/topup-return-notice'
import { rememberTopupStart, readTopupStart } from '../lib/topup-return'

vi.mock('@/lib/api', () => ({ getSelf: vi.fn() }))
vi.mock('@/lib/currency', () => ({
  formatQuotaWithCurrency: (quota: number) => `$${(quota / 100).toFixed(2)}`,
}))

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  cleanup()
  client.clear()
  window.sessionStorage.clear()
  vi.mocked(getSelf).mockReset()
})

function renderNotice(props: Partial<Parameters<typeof TopupReturnNotice>[0]>) {
  const onDismiss = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <TopupReturnNotice status='success' onDismiss={onDismiss} {...props} />
    </QueryClientProvider>
  )
  return { onDismiss }
}

describe('TopupReturnNotice', () => {
  it('says how much arrived once the balance grows, and keeps the draft note', async () => {
    rememberTopupStart(500)
    vi.mocked(getSelf).mockResolvedValue({ data: { quota: 1500 } } as never)
    renderNotice({ keptNote: 'Your draft is still here.' })

    expect(
      await screen.findByText('$10.00 arrived. Balance $15.00')
    ).toBeVisible()
    expect(screen.getByText('Your draft is still here.')).toBeVisible()
    expect(readTopupStart(Date.now())).toBeNull()
    expect(client.getQueryData(['video-studio', 'balance'])).toBe(1500)
  })

  it('keeps waiting while the balance has not grown yet', async () => {
    rememberTopupStart(500)
    vi.mocked(getSelf).mockResolvedValue({ data: { quota: 500 } } as never)
    renderNotice({})

    expect(
      await screen.findByText('Payment received, confirming the credit')
    ).toBeVisible()
    expect(readTopupStart(Date.now())).not.toBeNull()
  })

  it('says nothing was charged after a cancel and offers to pay again', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const { onDismiss } = renderNotice({ status: 'cancelled', onRetry })

    expect(screen.getByText('Nothing was charged this time')).toBeVisible()
    expect(getSelf).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Pay again' }))
    expect(onRetry).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
