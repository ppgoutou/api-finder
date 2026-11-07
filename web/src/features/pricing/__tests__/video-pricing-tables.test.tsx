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
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { VideoPricingTables } from '../components/video-pricing-tables'
import { getOfficialVideoPricing, getVideoPricing } from '../lib/video-pricing'
import type { PricingModel } from '../types'

const MODEL: PricingModel = {
  id: 1,
  model_name: 'seedance-2.0',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  billing_mode: 'tiered_expr',
  billing_expr:
    'u("resolution") == "480p" ? tier("480p", u("reference_video_tokens") * 28 / 1000000 + u("seconds") * 0.56) : ' +
    'tier("720p", u("reference_video_tokens") * 28 / 1000000 + u("seconds") * 1)',
  official_price_expr:
    'u("resolution") == "480p" ? tier("480p", u("reference_video_tokens") * 40 / 1000000 + u("seconds") * 0.8) : ' +
    'tier("720p", u("reference_video_tokens") * 40 / 1000000 + u("seconds") * 1.5)',
  billing_usage_schema: {
    seconds: { type: 'number', unit: 'second' },
    reference_video_tokens: { type: 'number', unit: 'token' },
    resolution: { enum: ['480p', '720p'] },
  },
  model_limits: { minDuration: 4, maxDuration: 15 },
}

function renderTables(groups: string[], model: PricingModel = MODEL) {
  const pricing = getVideoPricing(model)
  if (!pricing) throw new Error('expected video pricing')
  return render(
    <VideoPricingTables
      model={model}
      pricing={pricing}
      officialPricing={getOfficialVideoPricing(model)}
      groups={groups}
      groupRatio={{ default: 0.65 }}
      priceRate={1}
      usdExchangeRate={1}
      showRechargePrice={false}
    />
  )
}

function tableRows(title: string): string[][] {
  const section = screen.getByText(title).closest('section') as HTMLElement
  return within(section)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? '')
    )
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('video pricing tables', () => {
  it('shows the official price per resolution, without any group ratio, instead of the charged base price', () => {
    renderTables(['default'])

    expect(tableRows('Official Price')).toEqual([
      ['480p', '$0.8', '$40 / 1M tokens10,044 tokens per second', '4～15'],
      ['720p', '$1.5', '$40 / 1M tokens21,600 tokens per second', '4～15'],
    ])
    expect(screen.queryByText('Base Price')).not.toBeInTheDocument()
  })

  it('hides the top price table when the model has no official price', () => {
    renderTables(['default'], { ...MODEL, official_price_expr: undefined })

    expect(screen.queryByText('Official Price')).not.toBeInTheDocument()
    expect(screen.queryByText('Base Price')).not.toBeInTheDocument()
    expect(screen.getByText('Pricing by Group')).toBeVisible()
  })

  it('applies the group ratio to every price in the group table', () => {
    renderTables(['default'])

    expect(tableRows('Pricing by Group')).toEqual([
      [
        'default',
        '480p',
        '$0.36',
        '$18.2 / 1M tokens10,044 tokens per second',
        '4～15',
      ],
      [
        'default',
        '720p',
        '$0.65',
        '$18.2 / 1M tokens21,600 tokens per second',
        '4～15',
      ],
    ])
  })

  it('works through a 5s reference with a 15s 720p output at the group price', () => {
    renderTables(['default'])

    expect(screen.getByText(/^Example \(default\)/)).toHaveTextContent(
      'Example (default): 5s reference video, 15s 720p output. Reference seconds = max(5, ⌈15 × 2/3⌉) = 10s; tokens = (15 + 10) × 21,600 = 540,000; cost = 540,000 × $18.2 / 1M tokens = $9.83'
    )
  })

  it('prices reference orders per output second when the model has a per-second reference price', () => {
    renderTables(['default'], {
      ...MODEL,
      official_price_expr: undefined,
      billing_expr:
        'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("seconds") * 1) : ' +
        'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 2) : ' +
        'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("seconds") * 3) : ' +
        'tier("720p·video", u("seconds") * 4)',
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
        video_input: { enum: ['none', 'video'] },
        resolution: { enum: ['480p', '720p'] },
      },
    })

    expect(tableRows('Pricing by Group')).toEqual([
      ['default', '480p', '$0.65', '$1.3/second', '4～15'],
      ['default', '720p', '$1.95', '$2.6/second', '4～15'],
    ])
    expect(
      screen.getByText(
        'With reference videos, only the output seconds are billed, at the reference price.'
      )
    ).toBeVisible()
    expect(screen.queryByText(/whole order/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Example/)).not.toBeInTheDocument()
  })

  it('shows only the official table when the model is in no available group', () => {
    renderTables([])

    expect(screen.getByText('Official Price')).toBeVisible()
    expect(screen.queryByText('Pricing by Group')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Example/)).not.toBeInTheDocument()
  })
})

describe('VideoPricingTables with reference media priced on top', () => {
  const MEDIA_MODEL: PricingModel = {
    ...MODEL,
    official_price_expr: undefined,
    billing_expr:
      'u("resolution") == "768P" ? tier("768P", (u("seconds") * 1 + u("input_video_seconds") * 3 + max(u("input_images") - 5, 0) * 2)) : ' +
      'tier("480P", (u("seconds") * 1 + u("input_video_seconds") * 3 + max(u("input_images") - 5, 0) * 2))',
    billing_usage_schema: {
      seconds: { type: 'number', unit: 'second' },
      resolution: { enum: ['480P', '768P'] },
      input_images: { type: 'number', unit: 'count' },
      input_video_seconds: { type: 'number', unit: 'second' },
    },
  }

  it('shows the reference video and image prices, after the group ratio, when priced', () => {
    renderTables(['default'], MEDIA_MODEL)

    expect(
      screen.getByRole('columnheader', {
        name: 'Reference video price per second',
      })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Input image price' })
    ).toBeVisible()
    const firstRow = screen.getAllByRole('row')[1]
    expect(firstRow).toHaveTextContent('1.95')
    expect(firstRow).toHaveTextContent('$1.3')
    expect(firstRow).toHaveTextContent('First 5 free')
    expect(
      screen.getByText(/Reference videos are charged on top/)
    ).toBeVisible()
  })
})
