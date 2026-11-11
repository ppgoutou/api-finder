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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'

import { PricingCategoriesSection } from '../components/pricing-categories-section'

const stored = [
  {
    id: 'sd20',
    name: 'Seedance 2.0',
    description: 'Seedance 2.0 lines',
    models: ['sd-2.0-line-1'],
  },
  { id: 'sd25', name: 'Seedance 2.5', description: '', models: ['G2-V'] },
]

function mockApi() {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/option/') {
      return {
        data: {
          success: true,
          data: [{ key: 'PricingCategories', value: JSON.stringify(stored) }],
        },
      }
    }
    if (url === '/api/channel/models_enabled') {
      return {
        data: {
          success: true,
          data: ['sd-2.0-line-1', 'seedance-2.0', 'G2-V'],
        },
      }
    }
    throw new Error(`unexpected GET ${url}`)
  })
  return vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <PricingCategoriesSection />
    </QueryClientProvider>
  )
}

function savedCategories(put: ReturnType<typeof mockApi>) {
  const request = put.mock.calls.at(-1)?.[1] as { key: string; value: string }
  expect(request.key).toBe('PricingCategories')
  return JSON.parse(request.value) as typeof stored
}

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})

describe('pricing categories management', () => {
  it('offers only models free of other categories and saves the edited category', async () => {
    const user = userEvent.setup()
    const put = mockApi()
    renderSection()

    const item = (
      await screen.findByRole('heading', { name: 'Seedance 2.0' })
    ).closest('li') as HTMLElement
    await user.click(within(item).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox'))

    expect(
      await screen.findByRole('option', { name: /seedance-2\.0/ })
    ).toBeVisible()
    expect(screen.queryByRole('option', { name: /G2-V/ })).toBeNull()

    await user.click(screen.getByRole('option', { name: /seedance-2\.0/ }))
    await user.keyboard('{Escape}')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(savedCategories(put)).toEqual([
      { ...stored[0], models: ['sd-2.0-line-1', 'seedance-2.0'] },
      stored[1],
    ])
  })

  it('saves the new order when a category moves down', async () => {
    const user = userEvent.setup()
    const put = mockApi()
    renderSection()

    const item = (
      await screen.findByRole('heading', { name: 'Seedance 2.0' })
    ).closest('li') as HTMLElement
    expect(within(item).getByRole('button', { name: 'Move up' })).toBeDisabled()
    await user.click(within(item).getByRole('button', { name: 'Move down' }))

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(savedCategories(put).map((category) => category.id)).toEqual([
      'sd25',
      'sd20',
    ])
  })

  it('saves the reordered models with the badges picked for them', async () => {
    const user = userEvent.setup()
    const put = mockApi()
    renderSection()

    const item = (
      await screen.findByRole('heading', { name: 'Seedance 2.0' })
    ).closest('li') as HTMLElement
    await user.click(within(item).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox'))
    await user.click(
      await screen.findByRole('option', { name: /seedance-2\.0/ })
    )
    await user.keyboard('{Escape}')

    await user.click(
      within(dialog).getByRole('button', { name: 'Move seedance-2.0 up' })
    )
    const badges = within(dialog).getByRole('group', {
      name: 'Badges for seedance-2.0',
    })
    const hot = within(badges).getByRole('button', { name: 'HOT' })
    expect(hot).toHaveAttribute('aria-pressed', 'false')
    await user.click(hot)
    expect(hot).toHaveAttribute('aria-pressed', 'true')
    await user.click(
      within(badges).getByRole('button', { name: 'Recommended' })
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(savedCategories(put)[0]).toEqual({
      ...stored[0],
      models: ['seedance-2.0', 'sd-2.0-line-1'],
      badges: { 'seedance-2.0': ['recommended', 'hot'] },
    })
  })
})

describe('category official price', () => {
  const VIDEO_SCHEMA = {
    seconds: { type: 'number', unit: 'second' },
    resolution: { enum: ['480p', '720p'] },
  }

  function mockPricing(
    schemas: Record<string, typeof VIDEO_SCHEMA | undefined>
  ) {
    const put = mockApi()
    const get = vi.mocked(api.get).getMockImplementation()
    vi.mocked(api.get).mockImplementation(async (url: string, config) => {
      if (url === '/api/option/model_pricing') {
        return {
          data: {
            success: true,
            data: {
              entries: Object.entries(schemas).map(([name, schema]) => ({
                model_name: name,
                version: 'v1',
                configured: {},
                effective: {},
                ...(schema ? { usage_schema: schema } : {}),
              })),
              options: {},
              empty_version: 'empty',
            },
          },
        }
      }
      return get?.(url, config)
    })
    return put
  }

  async function openSeedanceCategory(
    user: ReturnType<typeof userEvent.setup>
  ) {
    useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
    usePricingPreferencesStore.setState({ currency: 'USD' })
    renderSection()
    const item = (
      await screen.findByRole('heading', { name: 'Seedance 2.0' })
    ).closest('li') as HTMLElement
    await user.click(within(item).getByRole('button', { name: 'Edit' }))
    return screen.findByRole('dialog')
  }

  it('saves the per-second prices entered for each resolution as the category price table', async () => {
    const user = userEvent.setup()
    const put = mockPricing({ 'sd-2.0-line-1': VIDEO_SCHEMA })
    const dialog = await openSeedanceCategory(user)

    await user.type(
      await within(dialog).findByLabelText(
        '480p Price per second (USD /second)'
      ),
      '0.5'
    )
    await user.type(
      within(dialog).getByLabelText('720p Price per second (USD /second)'),
      '1.2'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(savedCategories(put)[0]).toEqual({
      ...stored[0],
      official_price: {
        kind: 'video',
        rows: [
          { option: '480p', second: 0.5 },
          { option: '720p', second: 1.2 },
        ],
      },
    })
  })

  it('offers every resolution of per-second and token-billed lines in one table', async () => {
    const user = userEvent.setup()
    mockPricing({
      'sd-2.0-line-1': VIDEO_SCHEMA,
      'seedance-2.0': {
        tokens: { type: 'number', unit: 'token' },
        resolution: { enum: ['720p', '4k'] },
        video_input: { enum: ['none', 'video'] },
      } as unknown as typeof VIDEO_SCHEMA,
    })
    const dialog = await openSeedanceCategory(user)
    await user.click(within(dialog).getByRole('combobox'))
    await user.click(
      await screen.findByRole('option', { name: /seedance-2\.0/ })
    )
    await user.keyboard('{Escape}')

    for (const option of ['480p', '720p', '4k']) {
      expect(
        await within(dialog).findByLabelText(
          `${option} Price per second (USD /second)`
        )
      ).toBeVisible()
    }
    expect(
      within(dialog).getByLabelText(
        '480p Reference video order price (USD /second)'
      )
    ).toBeVisible()
  })

  it('names the models shown another way instead of offering one official price', async () => {
    const user = userEvent.setup()
    mockPricing({ 'sd-2.0-line-1': VIDEO_SCHEMA, 'seedance-2.0': undefined })
    const dialog = await openSeedanceCategory(user)
    await user.click(within(dialog).getByRole('combobox'))
    await user.click(
      await screen.findByRole('option', { name: /seedance-2\.0/ })
    )
    await user.keyboard('{Escape}')

    expect(
      await within(dialog).findByText(/Models shown differently: seedance-2\.0/)
    ).toBeVisible()
    expect(
      within(dialog).queryByLabelText('480p Price per second (USD /second)')
    ).toBeNull()
  })
})
