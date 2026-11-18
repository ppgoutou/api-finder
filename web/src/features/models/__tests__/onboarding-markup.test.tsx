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

import type { ModelPricingEntry } from '@/features/model-pricing/api'
import type {
  BillingUsageSchema,
  PricingCategory,
} from '@/features/pricing/types'
import { api } from '@/lib/api'

import { OnboardingMarkupTable } from '../components/onboarding/onboarding-markup-table'
import {
  batchAdjustment,
  markupRows,
  officialSecondPrice,
  onboardingOfficialPricing,
  tierMarkups,
} from '../lib/onboarding-markup'
import type { OnboardingMarkup } from '../types'

const schema: BillingUsageSchema = {
  tokens: { type: 'number', unit: 'token' },
  resolution: { enum: ['480p', '720p'] },
  video_input: { enum: ['none', 'video'] },
}

const tokenExpr =
  'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("tokens") * 28 / 1000000) : ' +
  'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("tokens") * 16 / 1000000) : ' +
  'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("tokens") * 28 / 1000000) : ' +
  'tier("720p·video", u("tokens") * 16 / 1000000)'

const secondSchema: BillingUsageSchema = {
  seconds: { type: 'number', unit: 'second' },
  resolution: { enum: ['480p', '720p'] },
  video_input: { enum: ['none', 'video'] },
}

const secondExpr =
  'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 0.13) : ' +
  'tier("480p", u("seconds") * 0.1)'

const officialTable: PricingCategory[] = [
  {
    id: 'seedance',
    name: 'Seedance',
    models: ['video'],
    official_price: {
      kind: 'video',
      rows: [{ option: '480p', second: 0.5, reference_second: 0.3 }],
    },
  },
]

function pricingEntry(
  expression: string,
  extra?: Partial<ModelPricingEntry>
): ModelPricingEntry {
  return {
    model_name: 'video',
    version: 'v1',
    configured: {
      'billing_setting.billing_mode': 'tiered_expr',
      'billing_setting.billing_expr': expression,
    },
    effective: {},
    usage_schema: schema,
    ...extra,
  }
}

function renderTable(
  markup?: OnboardingMarkup,
  extra?: Partial<ModelPricingEntry>,
  context?: {
    groupRatios?: Record<string, number>
    modelGroupRatios?: Record<string, number>
    categories?: PricingCategory[]
  }
) {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <OnboardingMarkupTable
        entry={pricingEntry(markup?.base_expr ?? tokenExpr, extra)}
        markup={markup}
        priceFactor={1.2}
        groupRatios={context?.groupRatios ?? { default: 1.2 }}
        modelGroupRatios={context?.modelGroupRatios}
        categories={context?.categories ?? []}
      />
    </QueryClientProvider>
  )
}

function markupInput(tier: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', {
    name: new RegExp(tier),
  })
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', {
    name: 'Save price adjustments',
  })
}

function batchValue(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Batch adjustment value',
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('markupRows', () => {
  it('converts each token tier to a price per second of its resolution', () => {
    const rows = markupRows(tokenExpr, schema, undefined)

    expect(rows.map((row) => row.tier)).toEqual([
      '480p·none',
      '480p·video',
      '720p·none',
      '720p·video',
    ])
    expect(rows[0].tokensPerSecond).toBe(10044)
    expect(rows[0].supply).toBeCloseTo((28 * 10044) / 1_000_000)
    expect(rows[3].supply).toBeCloseTo((16 * 21600) / 1_000_000)
  })

  it('uses the plugin example rate when one is published', () => {
    const rows = markupRows(tokenExpr, schema, [
      {
        label: '480p · 5s',
        facts: { tokens: 50000, resolution: '480p', video_input: 'none' },
      },
    ])

    expect(rows[0].tokensPerSecond).toBe(10000)
  })

  it('marks only reference-video tiers as priced per output plus reference second', () => {
    const rows = markupRows(tokenExpr, schema, undefined)

    expect(rows.map((row) => row.reference)).toEqual([false, true, false, true])
  })

  it('returns no rows for an expression a markup cannot raise', () => {
    expect(
      markupRows('tier("base", 0.1 + u("tokens") * 2 / 1000000)', schema, [])
    ).toEqual([])
  })

  it('sends only non-zero markups, discounts included, with the token rate of token tiers', () => {
    const rows = markupRows(tokenExpr, schema, undefined)

    expect(
      tierMarkups(rows, {
        '480p·none': 0.1,
        '480p·video': -0.05,
        '720p·none': 0,
      })
    ).toEqual({
      '480p·none': {
        field: 'tokens',
        per_second: 0.1,
        tokens_per_second: 10044,
      },
      '480p·video': {
        field: 'tokens',
        per_second: -0.05,
        tokens_per_second: 10044,
      },
    })
  })
})

describe('officialSecondPrice', () => {
  const official = onboardingOfficialPricing(
    'video',
    tokenExpr.replaceAll('* 28 /', '* 40 /').replaceAll('* 16 /', '* 20 /'),
    schema,
    undefined,
    []
  )

  it('prices plain and reference rows per second at the row token rate', () => {
    const rows = markupRows(tokenExpr, schema, undefined)

    expect(officialSecondPrice(rows[0], official)).toBeCloseTo(
      (40 * 10044) / 1_000_000
    )
    expect(officialSecondPrice(rows[3], official)).toBeCloseTo(
      (20 * 21600) / 1_000_000
    )
  })

  it('falls back to the category official table when the model has none', () => {
    const fromCategory = onboardingOfficialPricing(
      'video',
      '',
      schema,
      undefined,
      [
        {
          id: 'seedance',
          name: 'Seedance',
          models: ['video'],
          official_price: {
            kind: 'video',
            rows: [{ option: '480p', second: 0.5, reference_second: 0.3 }],
          },
        },
      ]
    )
    const rows = markupRows(tokenExpr, schema, undefined)

    expect(officialSecondPrice(rows[0], fromCategory)).toBe(0.5)
    expect(officialSecondPrice(rows[1], fromCategory)).toBe(0.3)
    expect(officialSecondPrice(rows[2], fromCategory)).toBeUndefined()
  })
})

describe('officialSecondPrice for per-second tiers', () => {
  const official = onboardingOfficialPricing(
    'video',
    '',
    secondSchema,
    undefined,
    officialTable
  )
  const rows = markupRows(secondExpr, secondSchema, undefined)

  it('compares a plain per-second tier with the official second price', () => {
    expect(officialSecondPrice(rows[1], official)).toBe(0.5)
  })

  it('leaves a per-second reference tier without an official price', () => {
    expect(officialSecondPrice(rows[0], official)).toBeUndefined()
  })
})

describe('batchAdjustment', () => {
  it.each([
    ['add', 0.1, 0.1],
    ['subtract', 0.1, -0.1],
    ['add_percent', 20, 0.1251],
    ['subtract_percent', 20, -0.1251],
  ] as const)(
    'turns %s %s into an adjustment of %s on a 0.6256 ratio price',
    (operation, value, expected) => {
      expect(batchAdjustment(operation, value, 0.6256)).toBe(expected)
    }
  )
})

describe('OnboardingMarkupTable', () => {
  it('shows the final price as the group ratio price plus the typed markup', async () => {
    renderTable()
    const input = markupInput('480p·none')
    const row = input.closest('tr') as HTMLElement

    await userEvent.type(input, '0.1')

    const supply = (28 * 10044) / 1_000_000
    expect(within(row).getByText(`$${supply.toFixed(4)}/s`)).toBeTruthy()
    expect(
      within(row).getByText(`$${(supply * 1.2).toFixed(4)}/s`)
    ).toBeTruthy()
    expect(
      within(row).getByText(`$${(supply * 1.2 + 0.1).toFixed(4)}/s`)
    ).toBeTruthy()
  })

  it('prices another group by its ratio, adjustment included, with its profit', async () => {
    renderTable(undefined, undefined, {
      groupRatios: { default: 1.2, vip: 2.4 },
    })
    await userEvent.type(markupInput('480p·none'), '0.1')

    await userEvent.click(screen.getByRole('combobox', { name: 'Group' }))
    await userEvent.click(await screen.findByRole('option', { name: /vip/ }))

    const row = markupInput('480p·none').closest('tr') as HTMLElement
    const supply = (28 * 10044) / 1_000_000
    const final = (supply * 1.2 + 0.1) * 2
    expect(
      within(row).getByText(`$${(supply * 2.4).toFixed(4)}/s`)
    ).toBeTruthy()
    expect(within(row).getByText(`$${final.toFixed(4)}/s`)).toBeTruthy()
    expect(
      within(row).getByText(`$${(final - supply).toFixed(4)}/s`)
    ).toBeTruthy()
  })

  it('shows the gross margin as profit over the final price', async () => {
    renderTable()
    const input = markupInput('480p·none')
    const row = input.closest('tr') as HTMLElement

    await userEvent.type(input, '0.1')

    const supply = (28 * 10044) / 1_000_000
    const final = supply * 1.2 + 0.1
    const margin = Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumFractionDigits: 2,
    }).format((final - supply) / final)
    expect(within(row).getByText(margin)).toBeTruthy()
  })

  it('shows the final price as a share of the category official price', () => {
    renderTable(undefined, undefined, {
      categories: [
        {
          id: 'seedance',
          name: 'Seedance',
          models: ['video'],
          official_price: {
            kind: 'video',
            rows: [{ option: '480p', second: 0.5 }],
          },
        },
      ],
    })
    const row = markupInput('480p·none').closest('tr') as HTMLElement
    const share = (((28 * 10044) / 1_000_000) * 1.2) / 0.5

    expect(
      within(row).getByText(`${Number((share * 100).toFixed(1))}% of official`)
    ).toBeTruthy()
    const missing = markupInput('720p·none').closest('tr') as HTMLElement
    expect(within(missing).getByText('—')).toBeTruthy()
  })

  it('uses the model plugin example rate when the entry has no plugin variants', () => {
    renderTable(undefined, {
      usage_examples: [
        {
          label: '480p · 5s',
          facts: { tokens: 48038, resolution: '480p', video_input: 'none' },
        },
      ],
    })
    const row = markupInput('480p·none').closest('tr') as HTMLElement

    const supply = (28 * 9607.6) / 1_000_000
    expect(within(row).getByText(`$${supply.toFixed(4)}/s`)).toBeTruthy()
  })

  it('labels reference-video rows as priced per output plus reference second', () => {
    renderTable()
    const plain = markupInput('480p·none').closest('tr') as HTMLElement
    const reference = markupInput('480p·video').closest('tr') as HTMLElement

    expect(
      within(reference).getByText('Per second of output plus reference video')
    ).toBeTruthy()
    expect(
      within(plain).queryByText('Per second of output plus reference video')
    ).toBeNull()
  })

  it('explains why a per-second reference row has no official share', () => {
    renderTable(
      undefined,
      {
        configured: {
          'billing_setting.billing_mode': 'tiered_expr',
          'billing_setting.billing_expr': secondExpr,
        },
        usage_schema: secondSchema,
      },
      { categories: officialTable }
    )
    const note =
      'Official pricing also bills reference video seconds, so it does not compare per output second'
    const reference = markupInput('480p·video').closest('tr') as HTMLElement
    const plain = markupInput('480p$').closest('tr') as HTMLElement

    expect(within(reference).getByText('—')).toBeTruthy()
    expect(within(reference).getByText(note)).toBeTruthy()
    expect(within(plain).queryByText(note)).toBeNull()
    expect(within(plain).getByText('24% of official')).toBeTruthy()
    expect(
      screen.getByText(/^Prices are per second of output video\./)
    ).toBeTruthy()
  })

  it('saves the typed markups for the model', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, data: { channels: [], changes: [] } },
    })
    renderTable()

    await userEvent.type(markupInput('720p·video'), '0.2')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save price adjustments' })
    )

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put).toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/markup',
      {
        model_name: 'video',
        tiers: {
          '720p·video': {
            field: 'tokens',
            per_second: 0.2,
            tokens_per_second: 21600,
          },
        },
      }
    )
  })

  it('starts from the saved markup and keeps save disabled until it changes', () => {
    renderTable({
      base_expr: tokenExpr,
      tiers: {
        '480p·none': {
          field: 'tokens',
          per_second: 0.1,
          tokens_per_second: 10044,
        },
      },
    })

    expect(markupInput('480p·none').value).toBe('0.1')
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('blocks saving a discount that takes the final price to 0 or below', async () => {
    renderTable()

    await userEvent.type(markupInput('480p·none'), '-1')

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(markupInput('480p·none').getAttribute('aria-invalid')).toBe('true')
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('flags a discount below the supply price but still allows saving it', async () => {
    renderTable()
    const input = markupInput('480p·none')
    const row = input.closest('tr') as HTMLElement

    await userEvent.type(input, '-0.1')

    expect(within(row).getByText('Below supply price')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(saveButton()).toHaveProperty('disabled', false)
  })

  it('applies a percentage discount of the ratio price to every tier', async () => {
    renderTable()

    await userEvent.click(screen.getByRole('button', { name: '− Percent' }))
    await userEvent.type(batchValue(), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Apply to all' }))

    const ratio480 = ((28 * 10044) / 1_000_000) * 1.2
    const ratio720 = ((16 * 21600) / 1_000_000) * 1.2
    expect(markupInput('480p·none').value).toBe(
      String(Number((-ratio480 * 0.1).toFixed(4)))
    )
    expect(markupInput('720p·video').value).toBe(
      String(Number((-ratio720 * 0.1).toFixed(4)))
    )
  })

  it('applies a fixed amount only to the selected tiers', async () => {
    renderTable()

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select 720p·none' })
    )
    await userEvent.type(batchValue(), '0.2')
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply to selected (1)' })
    )

    expect(markupInput('720p·none').value).toBe('0.2')
    expect(markupInput('480p·none').value).toBe('')
  })

  it('keeps apply to selected disabled until a tier is selected', async () => {
    renderTable()

    await userEvent.type(batchValue(), '0.2')

    expect(
      screen.getByRole('button', { name: 'Apply to selected (0)' })
    ).toHaveProperty('disabled', true)
  })

  it('clears only the selected tiers once some are selected', async () => {
    renderTable({
      base_expr: tokenExpr,
      tiers: {
        '480p·none': {
          field: 'tokens',
          per_second: 0.1,
          tokens_per_second: 10044,
        },
        '720p·none': {
          field: 'tokens',
          per_second: 0.2,
          tokens_per_second: 21600,
        },
      },
    })

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select 480p·none' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear selected' })
    )

    expect(markupInput('480p·none').value).toBe('')
    expect(markupInput('720p·none').value).toBe('0.2')
  })

  it('shows a fixed-price model per image and saves its adjustment per request', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, data: { channels: [], changes: [] } },
    })
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <OnboardingMarkupTable
          entry={{
            model_name: 'image',
            version: 'v1',
            configured: { ModelPrice: 0.3 },
            effective: {},
          }}
          markup={undefined}
          priceFactor={1.25}
          groupRatios={{ default: 1.25 }}
          categories={[]}
        />
      </QueryClientProvider>
    )
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Price adjustment per image',
    })
    const row = input.closest('tr') as HTMLElement

    await userEvent.type(input, '-0.05')

    expect(within(row).getByText('$0.3000/image')).toBeTruthy()
    expect(within(row).getByText('$0.3750/image')).toBeTruthy()
    expect(within(row).getByText('$0.3250/image')).toBeTruthy()
    await userEvent.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put).toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/markup',
      { model_name: 'image', per_request: -0.05 }
    )
  })

  it('reads a marked-up fixed price from the stored supplier price', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <OnboardingMarkupTable
          entry={{
            model_name: 'image',
            version: 'v1',
            configured: { ModelPrice: 0.34 },
            effective: {},
          }}
          markup={{ tiers: null, base_price: 0.3, per_request: 0.05 }}
          priceFactor={1.25}
          groupRatios={{ default: 1.25 }}
          categories={[]}
        />
      </QueryClientProvider>
    )
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Price adjustment per image',
    })

    expect(input.value).toBe('0.05')
    expect(
      within(input.closest('tr') as HTMLElement).getByText('$0.3000/image')
    ).toBeTruthy()
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it("prices a group at the model's own ratio and solves it from a target share of the official price", async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true, data: { channels: [], changes: [] } },
    })
    renderTable(
      { base_expr: secondExpr, tiers: null },
      { usage_schema: secondSchema },
      { modelGroupRatios: { default: 1.5 }, categories: officialTable }
    )
    const ratio = screen.getByRole<HTMLInputElement>('textbox', {
      name: /This model's ratio in default/,
    })
    const row = screen
      .getByRole('textbox', { name: 'Price adjustment per second for 480p' })
      .closest('tr') as HTMLElement

    expect(ratio.value).toBe('1.5')
    expect(within(row).getAllByText('$0.1500/s').length).toBeGreaterThan(0)

    // 83% of the $0.5 official price over the $0.1 supply price.
    await userEvent.type(
      screen.getByRole('textbox', { name: /Target share of official price/ }),
      '83'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Calculate ratio' })
    )

    expect(ratio.value).toBe('4.15')
    expect(within(row).getByText('83% of official')).toBeTruthy()
    await userEvent.click(
      screen.getByRole('button', { name: 'Save model ratio' })
    )
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put).toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/group_ratio',
      { model_name: 'video', ratios: { default: 4.15 } }
    )
  })
})
