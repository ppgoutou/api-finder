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
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'

import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { CachedPriceCell } from '../components/cached-price-cell'
import { ModelCard } from '../components/model-card'
import { ModelCardGrid } from '../components/model-card-grid'
import type { PricingModel } from '../types'

function pricingModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 1,
    model_name: 'example-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 3,
    enable_groups: ['default', 'premium'],
    group_ratio: { default: 1, premium: 3 },
    ...overrides,
  }
}

let queryClient: QueryClient
const originalStorage = useSystemConfigStore.persist.getOptions().storage
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size
    },
  })
  useSystemConfigStore.persist.setOptions({
    storage: createJSONStorage(() => localStorage),
  })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})
afterEach(() => {
  queryClient.clear()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useSystemConfigStore.persist.setOptions({ storage: originalStorage })
})

describe('model cards', () => {
  it('lists the administrator badges in the card header in the given order', () => {
    render(
      <ModelCard
        model={pricingModel({})}
        badges={['recommended', 'hot']}
        onClick={vi.fn()}
      />
    )
    const highlights = screen.getByRole('list', { name: 'Highlights' })
    const items = within(highlights).getAllByRole('listitem')
    expect(
      items.map((item) => item.getAttribute('aria-label') ?? item.textContent)
    ).toEqual(['Recommended', 'HOT'])
  })

  it('shows the recommended badge as an icon with its label for screen readers', () => {
    render(
      <ModelCard
        model={pricingModel({})}
        badges={['recommended']}
        onClick={vi.fn()}
      />
    )
    const badge = within(
      screen.getByRole('list', { name: 'Highlights' })
    ).getByRole('listitem', { name: 'Recommended' })
    expect(badge.textContent).toBe('')
    expect(badge.querySelector('svg')).not.toBeNull()
  })

  it('shows no badge list when the model has no badges', () => {
    render(<ModelCard model={pricingModel({})} onClick={vi.fn()} />)
    expect(screen.queryByRole('list', { name: 'Highlights' })).toBeNull()
  })

  it('shows separate generic and image cache prices including a free image cache', () => {
    render(
      <CachedPriceCell
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'tier("standard", p * 5 + cr * 1.25 + img * 8 + img_cr * 0 + c * 30)',
        })}
        options={{ tokenUnit: 'M' }}
      />
    )
    expect(screen.getByText('Cache Read').parentElement).toHaveTextContent(
      '$1.25'
    )
    expect(screen.getByText('Image Cache').parentElement).toHaveTextContent(
      '$0'
    )
  })
  it('shows fixed prices per request in both token display units', () => {
    const model = pricingModel({
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("request", fixed(0.01))',
    })
    const { rerender } = render(
      <ModelCard model={model} onClick={vi.fn()} tokenUnit='K' />
    )
    expect(screen.getByText('$0.01')).toBeVisible()
    expect(screen.getByText('/ request')).toBeVisible()
    rerender(<ModelCard model={model} onClick={vi.fn()} tokenUnit='M' />)
    expect(screen.getByText('$0.01')).toBeVisible()
    expect(screen.queryByText('/ 1M')).not.toBeInTheDocument()
  })
  it('updates the current time tier at a minute boundary and after returning to the page', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T08:59:59+08:00'))
    const model = pricingModel({
      billing_mode: 'tiered_expr',
      billing_expr:
        'hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12 ? tier("peak", p * 3 + c * 9) : tier("off_peak", p * 1.5 + c * 4.5)',
    })
    render(<ModelCard model={model} onClick={vi.fn()} tokenUnit='M' />)
    expect(screen.getByText('Current period price')).toBeVisible()
    expect(screen.getByText('$1.5')).toBeVisible()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('$3')).toBeVisible()
    act(() => {
      vi.setSystemTime(new Date('2026-09-07T12:00:00+08:00'))
      fireEvent(document, new Event('visibilitychange'))
    })
    expect(screen.getByText('$1.5')).toBeVisible()
  })

  it('opens details with the complete long model name and offers no copy button', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const name = 'provider/model-with-a-long-name-and-a-version-suffix-20260906'
    render(
      <ModelCard model={pricingModel({ model_name: name })} onClick={onClick} />
    )
    expect(screen.getByRole('heading', { name })).toHaveAttribute('title', name)
    expect(
      screen.queryByRole('button', { name: 'Copy model name' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledWith(name)
  })

  it('shows the display name while details still open by the model ID', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'seedance2.0-T',
          display_name: 'Seedance 2.0',
        })}
        onClick={onClick}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Seedance 2.0' })
    ).toHaveAttribute('title', 'seedance2.0-T')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(onClick).toHaveBeenCalledWith('seedance2.0-T')
  })

  it('opens the video studio with a video model when its try button is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const onTry = vi.fn()
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'seedance-2.0',
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.04) : tier("720p", u("seconds") * 0.09)',
          billing_usage_schema: {
            resolution: { enum: ['480p', '720p'] },
            seconds: { type: 'number', unit: 'second' },
          },
        })}
        onClick={onClick}
        onTry={onTry}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Try' }))

    expect(onTry).toHaveBeenCalledWith('seedance-2.0', 'video')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('marks an unavailable model, shows its reason and blocks trying it but not details', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const onTry = vi.fn()
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'D-sd2.5-G3-1',
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("720p", u("seconds") * 0.09)',
          billing_usage_schema: {
            resolution: { enum: ['720p'] },
            seconds: { type: 'number', unit: 'second' },
          },
          unavailable: true,
          unavailable_reason: 'Out of stock upstream',
        })}
        badges={['hot']}
        onClick={onClick}
        onTry={onTry}
      />
    )

    expect(screen.getByText('Temporarily unavailable')).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Highlights' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Out of stock upstream'
    )
    expect(screen.getByRole('button', { name: 'Try' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Details/ }))
    expect(onClick).toHaveBeenCalledWith('D-sd2.5-G3-1')
    expect(onTry).not.toHaveBeenCalled()
  })

  it('keeps the try and details buttons side by side with no space between them', () => {
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'seedance-2.0',
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.04) : tier("720p", u("seconds") * 0.09)',
          billing_usage_schema: {
            resolution: { enum: ['480p', '720p'] },
            seconds: { type: 'number', unit: 'second' },
          },
        })}
        onClick={vi.fn()}
        onTry={vi.fn()}
      />
    )

    const tryButton = screen.getByRole('button', { name: 'Try' })
    const detailsButton = screen.getByRole('button', { name: 'Details' })
    expect(tryButton.nextElementSibling).toBe(detailsButton)
    expect(tryButton.parentElement?.children).toHaveLength(2)
  })

  it('opens the image studio with an image generation model', async () => {
    const user = userEvent.setup()
    const onTry = vi.fn()
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'seedream-5.0',
          supported_endpoint_types: ['openai', 'image-generation'],
        })}
        onClick={vi.fn()}
        onTry={onTry}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Try' }))

    expect(onTry).toHaveBeenCalledWith('seedream-5.0', 'image')
  })

  it('lists per-second prices by resolution, and offers the studio, when a reference video changes the price', () => {
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'seedance-2.5-reference-switch',
          enable_groups: ['default'],
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("seconds") * 1) : ' +
            'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 2) : ' +
            'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("seconds") * 3) : ' +
            'tier("720p·video", u("seconds") * 4)',
          billing_usage_schema: {
            resolution: { enum: ['480p', '720p'] },
            seconds: { type: 'number', unit: 'second' },
            video_input: { enum: ['none', 'video'] },
          },
        })}
        onClick={vi.fn()}
        onTry={vi.fn()}
      />
    )

    const prices = screen.getByLabelText('Video billing (per second)')
    expect(within(prices).getByText('480p').nextSibling).toHaveTextContent('$1')
    expect(within(prices).getByText('720p').nextSibling).toHaveTextContent('$3')
    expect(
      screen.getByText('Orders with reference videos are priced separately')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try' })).toBeVisible()
  })

  it('offers no try button for a model the video studio cannot run', () => {
    render(
      <ModelCard model={pricingModel()} onClick={vi.fn()} onTry={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: 'Try' })).toBeNull()
  })

  it('shows only the try and details actions across the whole card footer', () => {
    render(
      <ModelCard
        model={pricingModel({
          model_name: 'seedream-5.0',
          supported_endpoint_types: ['openai', 'image-generation'],
        })}
        onClick={vi.fn()}
        onTry={vi.fn()}
      />
    )

    const actions = screen.getByRole('group', { name: 'Actions' })
    expect(actions).toHaveClass('w-full')
    expect(within(actions).getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Try' })).toHaveClass('flex-1')
    expect(screen.getByRole('button', { name: 'Details' })).toHaveClass(
      'flex-1'
    )
    expect(
      screen.queryByLabelText('Performance metrics for the last 24 hours')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
  })

  it('keeps group, endpoint and tag overflow counts with their own metadata', () => {
    const groups = ['default-with-a-long-group-name', 'premium', 'internal']
    const endpoints = ['openai-response', 'openai', 'claude', 'gemini', 'jina']
    const tags = [
      'video-generation',
      'high-resolution',
      'fast',
      'batch',
      'hd',
      'pro',
    ]
    render(
      <ModelCard
        model={pricingModel({
          enable_groups: groups,
          supported_endpoint_types: endpoints,
          tags: tags.join(','),
        })}
        onClick={vi.fn()}
      />
    )

    const groupField = screen.getByText('Groups').parentElement
    const endpointField = screen.getByText('Endpoints').parentElement
    if (!groupField || !endpointField) {
      throw new Error('Expected labeled group and endpoint fields')
    }
    const tagField = screen.getByRole('group', { name: 'Tags' })
    expect(within(groupField).getByText(groups[0])).toBeVisible()
    expect(within(groupField).getByText('+2')).toHaveAttribute(
      'title',
      groups.slice(1).join(', ')
    )
    expect(
      within(endpointField).getByText('openai-response, openai')
    ).toHaveAttribute('title', endpoints.join(', '))
    expect(within(endpointField).getByText('+3')).toBeVisible()
    expect(
      within(tagField).getByText('video-generation, high-resolution')
    ).toHaveAttribute('title', tags.join(', '))
    expect(within(tagField).getByText('+4')).toBeVisible()
    expect(
      within(screen.getByRole('group', { name: 'Pricing' })).getByText(
        'Token-based'
      )
    ).toBeVisible()
  })

  it('keeps the price right under the description and pins the group row above the footer', () => {
    render(<ModelCard model={pricingModel()} onClick={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Pricing' })).not.toHaveClass(
      'mt-auto'
    )
    expect(screen.getByText('Groups').closest('dl')).toHaveClass('mt-auto')
  })

  it('omits metadata fields when the model has no groups, endpoints or tags', () => {
    render(
      <ModelCard
        model={pricingModel({ enable_groups: [] })}
        onClick={vi.fn()}
      />
    )
    expect(screen.queryByText('Groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Endpoints')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Tags' })
    ).not.toBeInTheDocument()
  })

  it('keeps group and recharge pricing correct when changing the token unit, including a free cache price', () => {
    const props = {
      model: pricingModel({ cache_ratio: 0 }),
      onClick: vi.fn(),
      selectedGroup: 'premium',
      showRechargePrice: true,
      priceRate: 3,
      usdExchangeRate: 6,
    }
    const { rerender } = render(<ModelCard {...props} tokenUnit='M' />)
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$3\s*\/\s*1M/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$9\s*\/\s*1M/
    )
    expect(screen.getByText('Cached').parentElement).toHaveTextContent(
      /\$0\s*\/\s*1M/
    )
    rerender(<ModelCard {...props} tokenUnit='K' />)
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$0.003\s*\/\s*1K/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$0.009\s*\/\s*1K/
    )
    expect(screen.getByText('Cached').parentElement).toHaveTextContent(
      /\$0\s*\/\s*1K/
    )
  })

  it('shows a per-request price with the selected group and recharge multiplier without a token unit', () => {
    render(
      <ModelCard
        model={pricingModel({ quota_type: 1, model_price: 0.4 })}
        onClick={vi.fn()}
        selectedGroup='premium'
        showRechargePrice
        priceRate={3}
        usdExchangeRate={6}
        tokenUnit='K'
      />
    )
    expect(screen.getByText(/\$0.6/)).toHaveTextContent(/\$0.6\s*\/\s*request/)
    expect(screen.queryByText(/1K|1M/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Per Request')).toHaveLength(1)
    expect(screen.queryByText('Per-request')).not.toBeInTheDocument()
  })

  it('preserves expression prices and makes the selected token unit explicit', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 3 + c * 15)',
        })}
        onClick={vi.fn()}
        tokenUnit='K'
        selectedGroup='premium'
        showRechargePrice
        priceRate={3}
        usdExchangeRate={6}
      />
    )
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$0.0045\s*\/\s*1K/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$0.0225\s*\/\s*1K/
    )
  })

  it('shows the cache read price of an expression model after its input and output prices', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 0.15 + c * 0.6 + cr * 0.003)',
        })}
        onClick={vi.fn()}
        tokenUnit='M'
        selectedGroup='default'
      />
    )
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$0.15\s*\/\s*1M/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$0.6\s*\/\s*1M/
    )
    expect(screen.getByText('Cache Read').parentElement).toHaveTextContent(
      /\$0.003\s*\/\s*1M/
    )
  })

  it('shows the cache read price once when a plugin provider already lists it as a main price', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_plugin_variants: [
            {
              plugin_key: 'alpha',
              plugin_name: 'Alpha',
              billing_mode: 'tiered_expr',
              billing_expr: 'tier("base", p * 1 + c * 2 + cr * 0.5)',
              billing_usage_schema: {},
            },
          ],
        })}
        onClick={vi.fn()}
        tokenUnit='M'
        selectedGroup='default'
      />
    )
    expect(screen.getAllByText('Cache Read')).toHaveLength(1)
  })

  it('shows the cache read price of an expression model that prices nothing else', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", cr * 0.5)',
        })}
        onClick={vi.fn()}
        tokenUnit='M'
        selectedGroup='default'
      />
    )
    expect(screen.getByText('Cache Read').parentElement).toHaveTextContent(
      /\$0.5\s*\/\s*1M/
    )
  })

  it('lists each option price per second in schema order instead of a range for a single-enum video model', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.4) : u("resolution") == "1080p" ? tier("1080p", u("seconds") * 1.2) : tier("4k", u("seconds") * 2.5)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
            resolution: { enum: ['480p', '1080p', '4k'] },
          },
        })}
        onClick={vi.fn()}
        tokenUnit='K'
      />
    )
    const prices = screen.getByLabelText('Video billing (per second)')
    const rows = within(prices).getAllByRole('term')
    expect(rows.map((row) => row.textContent)).toEqual(['480p', '1080p', '4k'])
    expect(rows.map((row) => row.nextElementSibling?.textContent)).toEqual([
      '$0.4',
      '$1.2',
      '$2.5',
    ])
    expect(screen.getByText('Video billing (per second)')).toBeVisible()
    expect(screen.queryByText(/ – /)).not.toBeInTheDocument()
    expect(screen.queryByText(/1K|1M/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('Orders with reference videos are priced separately')
    ).not.toBeInTheDocument()
  })

  it('notes separately priced reference orders under the per-second prices when the model prices them', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "480p" ? tier("480p", u("reference_video_tokens") * 28 / 1000000 + u("seconds") * 0.56) : tier("720p", u("reference_video_tokens") * 28 / 1000000 + u("seconds") * 1)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
            reference_video_tokens: { type: 'number', unit: 'token' },
            resolution: { enum: ['480p', '720p'] },
          },
        })}
        onClick={vi.fn()}
      />
    )
    const prices = screen.getByLabelText('Video billing (per second)')
    expect(
      within(prices)
        .getAllByRole('definition')
        .map((cell) => cell.textContent)
    ).toEqual(['$0.56', '$1'])
    expect(
      screen.getByText('Orders with reference videos are priced separately')
    ).toBeVisible()
    expect(screen.queryByText(/1M/)).not.toBeInTheDocument()
  })

  it('headlines the cheapest per-second tier when the schema lists a dearer option first', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "1080p" ? tier("1080p", u("seconds") * 1.2) : tier("480p", u("seconds") * 0.4)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
            resolution: { enum: ['1080p', '480p'] },
          },
        })}
        onClick={vi.fn()}
      />
    )
    const headline = screen.getByText('/s from', { exact: false })
    expect(headline).toHaveTextContent('/s from · 480p')
    expect(headline.previousElementSibling).toHaveTextContent('$0.4')
  })

  it('rounds per-second video prices to two decimal places', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.437141) : tier("720p", u("seconds") * 0.9828)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
            resolution: { enum: ['480p', '720p'] },
          },
        })}
        onClick={vi.fn()}
      />
    )
    const prices = screen.getByLabelText('Video billing (per second)')
    expect(
      within(prices)
        .getAllByRole('definition')
        .map((cell) => cell.textContent)
    ).toEqual(['$0.44', '$0.98'])
  })

  it('keeps the task price range when an option adds a per-request charge', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("mode") == "pro" ? tier("pro", u("seconds") * 0.8 + 0.1) : tier("std", u("seconds") * 0.4)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
            mode: { enum: ['std', 'pro'] },
          },
        })}
        onClick={vi.fn()}
        tokenUnit='K'
      />
    )
    expect(screen.getByText(/0.4.*0.8/)).toHaveTextContent(/0.4 – \$0.8/)
    expect(screen.getByText(/^\/\s*s$/)).toBeVisible()
    expect(
      screen.queryByLabelText('Video billing (per second)')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Video billing (per second)')).toBeVisible()
  })

  it('shows the unconfigured usage message without inventing a token price', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
        })}
        onClick={vi.fn()}
      />
    )
    expect(
      screen.getByText('Usage-based billing · price not configured')
    ).toBeVisible()
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })

  it('shows a spaced task token range with its unit when an example price is present', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("mode") == "pro" ? tier("pro", u("tokens") * 70 / 1000000) : tier("std", u("tokens") * 42 / 1000000)',
          billing_usage_schema: {
            tokens: { type: 'number', unit: 'token' },
            mode: { enum: ['std', 'pro'] },
          },
          billing_usage_examples: [
            { label: '480p · 5s', facts: { tokens: 48000, mode: 'std' } },
          ],
        })}
        onClick={vi.fn()}
        tokenUnit='K'
      />
    )
    expect(screen.getByText('$42 – $70').parentElement).toHaveTextContent(
      '$42 – $70 / 1M token'
    )
    expect(screen.getByText(/480p · 5s ≈/)).toBeVisible()
    expect(screen.getByText('Task billing')).toBeVisible()
  })

  it('keeps an unrecognized expression visible with the special billing message', () => {
    const expression =
      'u("seconds") > 30 ? tier("long", u("seconds") * 0.3) : tier("short", u("seconds") * 0.4)'
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: expression,
          billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
        })}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('Special billing expression')).toBeVisible()
    expect(screen.getByText(expression)).toBeVisible()
  })

  it('lists the model cards without requesting performance metrics', async () => {
    const request = vi.spyOn(api, 'get')
    const onModelClick = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <ModelCardGrid models={[pricingModel()]} onModelClick={onModelClick} />
      </QueryClientProvider>
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(onModelClick).toHaveBeenCalledWith('example-model')
    expect(request).not.toHaveBeenCalledWith(
      '/api/perf-metrics/summary',
      expect.anything()
    )
  })

  it('paginates the model cards and disables navigation at both boundaries', async () => {
    const models = Array.from({ length: 21 }, (_, index) =>
      pricingModel({ id: index + 1, model_name: `model-${index + 1}` })
    )
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ModelCardGrid models={models} onModelClick={vi.fn()} />
      </QueryClientProvider>
    )
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'model-21' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByRole('heading', { name: 'model-1' })).toBeVisible()
  })

  it('switches the card grid to three columns at the xl breakpoint instead of 2xl', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ModelCardGrid models={[pricingModel()]} onModelClick={vi.fn()} />
      </QueryClientProvider>
    )
    const grid = screen
      .getByRole('heading', { name: 'example-model' })
      .closest('.grid')
    expect(grid).toHaveClass('xl:grid-cols-3')
    expect(grid).not.toHaveClass('2xl:grid-cols-3')
    expect(grid).not.toHaveClass('min-[1440px]:grid-cols-3')
  })
})
