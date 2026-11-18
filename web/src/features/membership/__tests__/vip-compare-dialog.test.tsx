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
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VipCompareButton } from '../components/vip-compare-button'
import { VipCompareDialog } from '../components/vip-compare-dialog'
import { useVipCompare } from '../hooks/use-vip-compare'
import type { MembershipInfo } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children?: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

const membership = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../hooks/use-membership', () => ({
  useMembership: () => ({ data: membership.current }),
}))

const visitor: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 400_000_000,
  single_threshold_quota: 250_000_000,
  vip_price_rate: 0.85,
  standard_concurrency: 10,
  vip_concurrency: 100,
  signed_in: false,
}

afterEach(() => {
  act(() => useVipCompare.getState().closeCompare())
})

function renderWithTrigger(info: MembershipInfo) {
  membership.current = info
  return render(
    <>
      <VipCompareButton source='test' />
      <VipCompareDialog />
    </>
  )
}

describe('VIP compare dialog', () => {
  it('opens on the trigger and compares standard and VIP side by side', async () => {
    const user = userEvent.setup()
    renderWithTrigger(visitor)

    await user.click(
      screen.getByRole('button', { name: /Compare VIP benefits/ })
    )

    const dialog = await screen.findByRole('dialog')
    const table = within(dialog).getByRole('table')
    expect(within(table).getByText('15% off every model')).toBeInTheDocument()
    expect(
      within(table).getByText('About 100 tasks at once')
    ).toBeInTheDocument()
    expect(
      within(table).getAllByText('Dedicated lines, served first').length
    ).toBeGreaterThan(0)
    expect(within(table).getByText('Shared lines')).toBeInTheDocument()
  })

  it('sends a visitor to sign up', async () => {
    renderWithTrigger(visitor)
    act(() => useVipCompare.getState().openCompare('test'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('link', { name: /Sign up and start saving/ })
    ).toHaveAttribute('href', '/sign-up')
    expect(
      within(dialog).getByRole('link', { name: 'Learn about VIP' })
    ).toHaveAttribute('href', '/vip')
  })

  it('sends a signed-in standard member to top up', async () => {
    renderWithTrigger({ ...visitor, signed_in: true, is_vip: false })
    act(() => useVipCompare.getState().openCompare('test'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('link', { name: /Top up to become VIP/ })
    ).toHaveAttribute('href', '/wallet')
  })

  it('tells a VIP member they already have it instead of asking to top up', async () => {
    renderWithTrigger({ ...visitor, signed_in: true, is_vip: true })
    act(() => useVipCompare.getState().openCompare('test'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('You are already VIP')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('link', { name: /Top up to become VIP/ })
    ).not.toBeInTheDocument()
  })

  it('shows the saving, concurrency and support figures above the table', async () => {
    renderWithTrigger(visitor)
    act(() => useVipCompare.getState().openCompare('test'))

    const dialog = await screen.findByRole('dialog')
    const figures = within(dialog).getAllByRole('definition')
    expect(figures.map((figure) => figure.textContent)).toEqual([
      '15%',
      '100',
      '24/7',
    ])
  })

  it('states the upgrade rule to a standard member and leaves the fee row out of the table', async () => {
    renderWithTrigger({ ...visitor, signed_in: true, is_vip: false })
    act(() => useVipCompare.getState().openCompare('test'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/upgraded automatically, with no membership fee/)
    ).toBeInTheDocument()
    const table = within(dialog).getByRole('table')
    expect(within(table).queryByText('Membership fee')).not.toBeInTheDocument()
  })

  it('tells a VIP member the benefits already apply', async () => {
    renderWithTrigger({ ...visitor, signed_in: true, is_vip: true })
    act(() => useVipCompare.getState().openCompare('test'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'You are VIP. Every benefit below already applies to your account.'
      )
    ).toBeInTheDocument()
  })

  it('renders no trigger while the VIP program is off', () => {
    renderWithTrigger({ ...visitor, enabled: false })

    expect(
      screen.queryByRole('button', { name: /Compare VIP benefits/ })
    ).not.toBeInTheDocument()
  })

  it('hides a standard-only trigger from VIP members', () => {
    membership.current = { ...visitor, signed_in: true, is_vip: true }
    render(<VipCompareButton source='test' standardOnly />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
