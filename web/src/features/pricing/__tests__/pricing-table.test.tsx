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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PricingTable } from '../components/pricing-table'
import type { PricingModel } from '../types'

const PER_CALL_MODEL: PricingModel = {
  id: 1,
  model_name: 'seedance-2.0',
  quota_type: 1,
  model_price: 1,
  model_ratio: 0,
  completion_ratio: 0,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

const TOKEN_MODEL: PricingModel = {
  id: 2,
  model_name: 'gpt-test',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  cache_ratio: 0.1,
  vendor_name: 'OpenAI',
  tags: 'chat',
  enable_groups: ['default'],
}

function headers(): string[] {
  return screen
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent ?? '')
}

describe('PricingTable optional columns', () => {
  it('hides cache, vendor and tag columns when no model has those values', () => {
    render(<PricingTable models={[PER_CALL_MODEL]} />)

    const shown = headers()
    expect(shown).not.toContain('Cached')
    expect(shown).not.toContain('Vendor')
    expect(shown).not.toContain('Tags')
    expect(shown).toContain('Endpoints')
  })

  it('shows cache, vendor and tag columns when any model has those values', () => {
    render(<PricingTable models={[PER_CALL_MODEL, TOKEN_MODEL]} />)

    const shown = headers()
    expect(shown).toContain('Cached')
    expect(shown).toContain('Vendor')
    expect(shown).toContain('Tags')
  })
})
