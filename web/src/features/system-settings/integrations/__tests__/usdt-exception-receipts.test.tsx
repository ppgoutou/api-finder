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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { UsdtExceptionReceipts } from '../usdt-exception-receipts'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

const unmatched = {
  id: 7,
  tx_hash: 'a'.repeat(64),
  log_index: 0,
  user_id: 0,
  amount: '9.000000',
  status: 'unmatched',
}

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <UsdtExceptionReceipts />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
})

test('shows that nothing needs attention when the list is empty', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { items: [] } },
  })

  renderList()

  expect(
    await screen.findByText('No transfers need attention')
  ).toBeInTheDocument()
})

test('sends the note and refreshes the list when a transfer is marked handled', async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({
      data: { success: true, data: { items: [unmatched] } },
    })
    .mockResolvedValue({ data: { success: true, data: { items: [] } } })
  vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
  const user = userEvent.setup()

  renderList()
  await user.click(
    await screen.findByRole('button', { name: 'Mark as handled' })
  )
  await user.type(screen.getByLabelText('Note'), 'refunded')
  const confirm = screen
    .getAllByRole('button', { name: 'Mark as handled' })
    .at(-1)
  if (!confirm) throw new Error('confirm button not rendered')
  await user.click(confirm)

  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/api/user/topup/usdt/exceptions/7/resolve',
      { note: 'refunded' }
    )
  )
  expect(
    await screen.findByText('No transfers need attention')
  ).toBeInTheDocument()
})
