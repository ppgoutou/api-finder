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
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PricingSidebar } from '../components/pricing-sidebar'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import type { PricingModel } from '../types'

function toolbarProps(): PricingToolbarProps {
  return {
    filteredCount: 2,
    totalCount: 2,
    sortBy: 'name',
    tokenUnit: 'M',
    showRechargePrice: false,
    viewMode: 'card',
    quotaTypeFilter: 'all',
    modelTypeFilter: 'all',
    categoryFilter: 'all',
    onSortChange: vi.fn(),
    onTokenUnitChange: vi.fn(),
    onRechargePriceChange: vi.fn(),
    onViewModeChange: vi.fn(),
    onQuotaTypeChange: vi.fn(),
    onModelTypeChange: vi.fn(),
    onCategoryChange: vi.fn(),
    categories: [],
    models: [],
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

describe('pricing controls', () => {
  it('counts models by pricing and model type and updates when the catalog changes', () => {
    const props = toolbarProps()
    const base: PricingModel = {
      id: 1,
      model_name: 'image-model',
      vendor_name: 'Vendor A',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      tags: 'Image',
      supported_endpoint_types: ['openai', 'image-generation'],
    }
    const models: PricingModel[] = [
      base,
      {
        ...base,
        id: 2,
        model_name: 'per-video-model',
        supported_endpoint_types: ['openai'],
        billing_usage_schema: { videos: { type: 'number', unit: 'count' } },
      },
      {
        ...base,
        id: 3,
        model_name: 'per-second-model',
        supported_endpoint_types: ['openai'],
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
    ]
    const { rerender } = render(<PricingSidebar {...props} models={models} />)

    expect(
      screen.getByRole('button', { name: /^Token-based\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Per Request\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Duration billing\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Video Models\s*2$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Image Models\s*1$/ })
    ).toBeVisible()

    rerender(<PricingSidebar {...props} models={[models[0]]} />)
    expect(
      screen.getByRole('button', { name: /^Duration billing\s*0$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Video Models\s*0$/ })
    ).toBeVisible()
  })

  it('shows only the category, pricing and model type sections when rendered', () => {
    render(
      <PricingSidebar
        {...toolbarProps()}
        categories={[{ id: 'c1', name: 'Seedance', models: ['m'] }]}
        models={[
          {
            id: 1,
            model_name: 'm',
            vendor_name: 'Vendor A',
            quota_type: 0,
            model_ratio: 1,
            completion_ratio: 1,
            enable_groups: ['default'],
            tags: 'Video',
            supported_endpoint_types: ['openai'],
          },
        ]}
      />
    )

    const sections = screen
      .getAllByRole('button', { expanded: true })
      .map((section) => section.textContent)
    expect(sections).toEqual(['Categories', 'Pricing Type', 'Model Type'])
  })

  it('changes the token unit and keeps the selected unit pressed when clicked again', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: '/1K' }))
    expect(props.onTokenUnitChange).toHaveBeenCalledWith('K')
    rerender(<PricingToolbar {...props} tokenUnit='K' />)
    const selected = screen.getByRole('button', { name: '/1K' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    await user.click(selected)
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(props.onTokenUnitChange).toHaveBeenCalledTimes(1)
  })

  it('changes the recharge display mode with an accessible selected state', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Recharge' }))
    expect(props.onRechargePriceChange).toHaveBeenCalledWith(true)
    rerender(<PricingToolbar {...props} showRechargePrice />)
    expect(screen.getByRole('button', { name: 'Recharge' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('switches to table view with the keyboard and exposes the selected view', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    const tableButton = screen.getByRole('button', { name: 'Table view' })
    tableButton.focus()
    await user.keyboard('{Enter}')
    expect(props.onViewModeChange).toHaveBeenCalledWith('table')
    rerender(<PricingToolbar {...props} viewMode='table' />)
    expect(tableButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('selects price sorting from the shared dropdown', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Name' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Price: Low to High' })
    )
    expect(props.onSortChange).toHaveBeenCalledWith('price-low')
  })

  it('opens mobile filters from the left, selects a pricing type, and restores focus on close', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    expect(dialog).toHaveAttribute('data-side', 'left')
    expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeDisabled()
    await user.click(
      within(dialog).getByRole('button', { name: /Per Request/ })
    )
    expect(props.onQuotaTypeChange).toHaveBeenCalledWith('request')
    rerender(
      <PricingToolbar
        {...props}
        quotaTypeFilter='request'
        hasActiveFilters
        activeFilterCount={1}
      />
    )
    expect(
      within(dialog).getByRole('button', { name: /Per Request/ })
    ).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    expect(props.onClearFilters).toHaveBeenCalledOnce()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: /Filter/ })).toHaveFocus()
  })
  it('lists configured categories with visible model counts and selects one', async () => {
    const user = userEvent.setup()
    const props = toolbarProps()
    const base: PricingModel = {
      id: 1,
      model_name: 'seedance-2.0',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
    }
    const models = [
      base,
      { ...base, id: 2, model_name: 'sd-2.0-line-1' },
      { ...base, id: 3, model_name: 'wan3.0' },
    ]
    render(
      <PricingSidebar
        {...props}
        models={models}
        categories={[
          {
            id: 'sd20',
            name: 'Seedance 2.0',
            models: ['seedance-2.0', 'sd-2.0-line-1', 'hidden-model'],
          },
          { id: 'empty', name: 'Empty', models: ['hidden-model'] },
        ]}
      />
    )

    expect(
      screen.getByRole('button', { name: /^All Categories\s*3$/ })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Empty/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: /^Other models\s*1$/ })
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^Seedance 2.0\s*2$/ }))
    expect(props.onCategoryChange).toHaveBeenCalledWith('sd20')
  })

  it('hides the category filter when no category is configured', () => {
    render(<PricingSidebar {...toolbarProps()} />)

    expect(screen.queryByRole('button', { name: /All Categories/ })).toBeNull()
  })
})
