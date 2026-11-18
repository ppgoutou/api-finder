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
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VipCelebration } from '../components/vip-celebration'
import { vipCelebrationKey } from '../lib/vip-celebration'
import type { MembershipInfo } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children?: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ auth: { user: { id: 7 } } }),
}))

const membership = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../hooks/use-membership', () => ({
  useMembership: () => ({ data: membership.current }),
}))

const vip: MembershipInfo = {
  enabled: true,
  total_threshold_quota: 400_000_000,
  single_threshold_quota: 250_000_000,
  vip_price_rate: 0.85,
  signed_in: true,
  is_vip: true,
  vip_support_telegram: 'vip_desk',
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('VIP celebration', () => {
  it('welcomes a VIP member the first time this browser sees them', async () => {
    membership.current = vip
    render(<VipCelebration />)

    expect(await screen.findByText('Welcome to VIP!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Telegram/ })).toHaveAttribute(
      'href',
      'https://t.me/vip_desk'
    )
    expect(window.localStorage.getItem(vipCelebrationKey(7))).not.toBeNull()
  })

  it('stays closed once the member was welcomed on this browser', () => {
    window.localStorage.setItem(vipCelebrationKey(7), '1')
    membership.current = vip
    render(<VipCelebration />)

    expect(screen.queryByText('Welcome to VIP!')).not.toBeInTheDocument()
  })

  it('stays closed for a standard member', () => {
    membership.current = { ...vip, is_vip: false }
    render(<VipCelebration />)

    expect(screen.queryByText('Welcome to VIP!')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(vipCelebrationKey(7))).toBeNull()
  })
})
