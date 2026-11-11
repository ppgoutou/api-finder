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
import userEvent from '@testing-library/user-event'
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
const CONTACT_BUTTON = { name: /unrestricted content models: contact support/ }

describe('pricing hero note', () => {
  it('explains the -P suffix without a contact button when the viewer can use an unrestricted model', () => {
    render(
      <PricingHeroNote
        models={['C-seedance-2.0', 'A-seedance-2.0-P'].map(model)}
      />
    )

    expect(screen.getByText(SUFFIX_NOTE)).toBeInTheDocument()
    expect(screen.queryByRole('button', CONTACT_BUTTON)).not.toBeInTheDocument()
  })

  it('offers a contact button instead of the suffix note when none of the viewer models is unrestricted', () => {
    render(
      <PricingHeroNote models={['C-seedance-2.0', 'E-MiniMax-H3'].map(model)} />
    )

    expect(screen.getByRole('button', CONTACT_BUTTON)).toBeInTheDocument()
    expect(screen.queryByText(SUFFIX_NOTE)).not.toBeInTheDocument()
  })

  it('offers the contact button while no models are loaded', () => {
    render(<PricingHeroNote models={[]} />)

    expect(screen.getByRole('button', CONTACT_BUTTON)).toBeInTheDocument()
  })

  it('shows the QQ and Telegram contacts when the contact button is clicked', async () => {
    const user = userEvent.setup()
    render(<PricingHeroNote models={[]} />)

    const button = screen.getByRole('button', CONTACT_BUTTON)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('QQ:')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /@APIFinder_Support/ })
    ).toHaveAttribute('href', 'https://t.me/APIFinder_Support')
  })
})
