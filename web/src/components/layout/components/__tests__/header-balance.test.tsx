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
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { getSelf } from '@/lib/api'

import { HeaderBalance } from '../header-balance'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props} />
  ),
}))
vi.mock('@/lib/api', () => ({ getSelf: vi.fn() }))

function renderBalance() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HeaderBalance />
    </QueryClientProvider>
  )
}

describe('HeaderBalance', () => {
  it('shows the wallet balance and leads to the wallet', async () => {
    vi.mocked(getSelf).mockResolvedValue({ data: { quota: 500000 } } as never)
    renderBalance()

    const link = await screen.findByLabelText('Balance $1, open the wallet')
    expect(link).toHaveAttribute('href', '/wallet')
  })

  it('shows nothing while the balance is unknown', () => {
    vi.mocked(getSelf).mockReturnValue(new Promise(() => {}))
    renderBalance()

    expect(screen.queryByLabelText(/^Balance/)).toBeNull()
  })
})
