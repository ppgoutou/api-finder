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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { PromoPopup } from '../components/promo-popup/promo-popup'

const SETTINGS = JSON.stringify({
  enabled: true,
  cards: [
    {
      kind: 'model',
      title: 'Video model sale',
      model_name: 'Seedance 2.5',
      sale_price: '¥0.10',
      original_price: '¥0.20',
      unit: '/s',
    },
    {
      kind: 'recharge',
      description: 'Bonus credit arrives with the top-up.',
      tiers: [{ pay: '¥100', bonus: '¥10' }],
    },
    {
      kind: 'list',
      deals: [
        {
          model_name: 'Wan 3.0',
          sale_price: '¥0.15',
          original_price: '¥0.20',
          unit: '/s',
        },
      ],
    },
  ],
})

function mockSettings(value: string) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: value },
  })
}

function renderPopup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PromoPopup />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('home promotion popup', () => {
  it('stays closed when no popup is configured', async () => {
    mockSettings('')
    renderPopup()

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves between cards with the arrows and wraps around', async () => {
    const user = userEvent.setup()
    mockSettings(SETTINGS)
    renderPopup()

    expect(
      await screen.findByRole('heading', { name: 'Video model sale' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next offer' }))
    expect(
      screen.getByText('Bonus credit arrives with the top-up.')
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Video model sale' })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous offer' }))
    await user.click(screen.getByRole('button', { name: 'Previous offer' }))
    expect(screen.getByRole('link', { name: 'View all deals' })).toBeVisible()
  })

  it('marks the tab of the shown card and opens a card from its tab', async () => {
    const user = userEvent.setup()
    mockSettings(SETTINGS)
    renderPopup()

    const tab = await screen.findByRole('button', { name: 'Seedance 2.5' })
    expect(tab).toHaveAttribute('aria-current', 'true')

    await user.click(screen.getByRole('button', { name: 'Top-up offer' }))

    expect(tab).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Top up now' })).toHaveAttribute(
      'href',
      '/wallet'
    )
  })

  it('hides the arrows and tabs for a single card', async () => {
    mockSettings(
      JSON.stringify({
        enabled: true,
        cards: [JSON.parse(SETTINGS).cards[0]],
      })
    )
    renderPopup()

    await screen.findByRole('dialog')
    expect(
      screen.queryByRole('button', { name: 'Next offer' })
    ).not.toBeInTheDocument()
  })

  it('stops showing once the default limit of one a day is reached', async () => {
    const user = userEvent.setup()
    mockSettings(SETTINGS)
    const first = renderPopup()

    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    first.unmount()
    renderPopup()

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows up to the configured limit in the same browser', async () => {
    const user = userEvent.setup()
    mockSettings(JSON.stringify({ ...JSON.parse(SETTINGS), daily_limit: 2 }))

    const first = renderPopup()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    first.unmount()

    const second = renderPopup()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    second.unmount()

    renderPopup()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed after being turned off for today, whatever the limit', async () => {
    const user = userEvent.setup()
    mockSettings(JSON.stringify({ ...JSON.parse(SETTINGS), daily_limit: 5 }))
    const first = renderPopup()

    await screen.findByRole('dialog')
    await user.click(
      screen.getByRole('checkbox', { name: "Don't show again today" })
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    first.unmount()
    renderPopup()

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows again the next day after being turned off', async () => {
    localStorage.setItem('promo-popup-dismissed-day', '2000-01-01')
    localStorage.setItem(
      'promo-popup-views',
      JSON.stringify({ day: '2000-01-01', count: 9 })
    )
    mockSettings(SETTINGS)
    renderPopup()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
