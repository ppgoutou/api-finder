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

import { PricingHeroNote } from '../components/pricing-hero-note'
import type { PricingModel } from '../types'

function model(name: string): PricingModel {
  return {
    id: name.length,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  }
}

const SUFFIX_NOTE = /models ending in .* offer unrestricted content/
const CONTACT_NOTE = /contact support for unrestricted content models/

describe('pricing hero note', () => {
  it('explains the -P suffix when the viewer can use an unrestricted model', () => {
    render(
      <PricingHeroNote
        models={['C-seedance-2.0', 'A-seedance-2.0-P'].map(model)}
      />
    )

    expect(screen.getByText(SUFFIX_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(CONTACT_NOTE)).not.toBeInTheDocument()
  })

  it('points to support when none of the viewer models is unrestricted', () => {
    render(
      <PricingHeroNote models={['C-seedance-2.0', 'E-MiniMax-H3'].map(model)} />
    )

    expect(screen.getByText(CONTACT_NOTE)).toBeInTheDocument()
    expect(screen.queryByText(SUFFIX_NOTE)).not.toBeInTheDocument()
  })

  it('points to support while no models are loaded', () => {
    render(<PricingHeroNote models={[]} />)

    expect(screen.getByText(CONTACT_NOTE)).toBeInTheDocument()
  })
})
