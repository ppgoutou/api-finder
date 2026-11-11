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
import { useAuthStore } from '@/stores/auth-store'
import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'

import type { ModelPricingConfig } from '../api'
import { OfficialPriceEditor } from '../official-price-editor'
import { pricingOptions } from '../pricing'

const CATEGORY_PRICE = 'tier("base", p * 2 + c * 8)'
const OWN_PRICE = 'tier("base", p * 1 + c * 4)'

function mockApi(ownPrice?: string) {
  const configured: Record<string, string> = ownPrice
    ? { 'billing_setting.official_price_expr': ownPrice }
    : {}
  const snapshot: ModelPricingConfig = {
    entries: [
      { model_name: 'chat-x', version: 'v1', configured, effective: {} },
    ],
    options: pricingOptions({}),
    empty_version: 'empty',
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/option/model_pricing') {
      return { data: { success: true, data: snapshot } }
    }
    if (url === '/api/option/') {
      const categories = [
        {
          id: 'chat',
          name: 'Chat',
          models: ['chat-x'],
          official_price_expr: CATEGORY_PRICE,
        },
      ]
      return {
        data: {
          success: true,
          data: [
            { key: 'PricingCategories', value: JSON.stringify(categories) },
          ],
        },
      }
    }
    return { data: { success: true, data: [] } }
  })
  return vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
}

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OfficialPriceEditor modelName='chat-x' />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  usePricingPreferencesStore.setState({ currency: 'USD' })
})

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('model official price editor', () => {
  it('shows the inherited category price per 1M tokens and saves an edit as the model own price', async () => {
    const user = userEvent.setup()
    const put = mockApi()
    renderEditor()

    expect(
      await screen.findByText(/Inherited from category Chat/)
    ).toBeVisible()
    const input = await screen.findByLabelText('Input (USD / 1M tokens)')
    await waitFor(() => expect(input).toHaveValue('2'))
    expect(screen.getByLabelText('Output (USD / 1M tokens)')).toHaveValue('8')
    expect(
      screen.getByRole('button', { name: 'Save official price' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Use category price' })
    ).toBeDisabled()

    await user.clear(input)
    await user.type(input, '3')
    await user.click(
      screen.getByRole('button', { name: 'Save official price' })
    )

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(put.mock.calls[0]).toEqual([
      '/api/option/model_pricing/official',
      { model_name: 'chat-x', expression: 'tier("base", p * 3 + c * 8)' },
    ])
  })

  it('shows the model own price over the category and removes it to inherit again', async () => {
    const user = userEvent.setup()
    const put = mockApi(OWN_PRICE)
    renderEditor()

    expect(
      await screen.findByText(/takes precedence over category Chat/)
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.getByLabelText('Input (USD / 1M tokens)')).toHaveValue('1')
    )

    await user.click(screen.getByRole('button', { name: 'Use category price' }))

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(put.mock.calls[0]?.[1]).toEqual({
      model_name: 'chat-x',
      expression: '',
    })
  })
})
