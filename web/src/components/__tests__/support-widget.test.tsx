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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SupportWidget } from '../support-widget'

const routerState = vi.hoisted(() => ({ pathname: '/' }))
const membershipState = vi.hoisted(() => ({
  data: undefined as
    | { is_vip?: boolean; vip_support_telegram?: string }
    | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options: {
    select: (state: { location: { pathname: string } }) => string
  }) => options.select({ location: { pathname: routerState.pathname } }),
}))

vi.mock('@/features/membership', () => ({
  useMembership: () => membershipState,
}))

describe('support widget', () => {
  beforeEach(() => {
    routerState.pathname = '/'
    membershipState.data = undefined
  })

  it('sends a VIP user to the VIP support account', async () => {
    membershipState.data = { is_vip: true, vip_support_telegram: 'vip_desk' }
    const user = userEvent.setup()
    render(<SupportWidget />)

    await user.click(screen.getByRole('button', { name: 'Contact support' }))

    expect(screen.getByText('VIP support, 24/7')).toBeInTheDocument()
    const link = await screen.findByRole('link', { name: /Open Telegram/ })
    expect(link).toHaveAttribute('href', 'https://t.me/vip_desk')
  })

  it('keeps regular support for a VIP user when no VIP account is set', async () => {
    membershipState.data = { is_vip: true, vip_support_telegram: '' }
    const user = userEvent.setup()
    render(<SupportWidget />)

    await user.click(screen.getByRole('button', { name: 'Contact support' }))

    const link = await screen.findByRole('link', { name: /Open Telegram/ })
    expect(link).toHaveAttribute('href', 'https://t.me/APIFinder_Support')
  })

  it('opens the Telegram card when the floating button is clicked', async () => {
    const user = userEvent.setup()
    render(<SupportWidget />)

    const button = screen.getByRole('button', { name: 'Contact support' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)

    expect(
      screen.getByRole('button', { name: 'Close support' })
    ).toHaveAttribute('aria-expanded', 'true')
    const link = await screen.findByRole('link', { name: /Open Telegram/ })
    expect(link).toHaveAttribute('href', 'https://t.me/APIFinder_Support')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('@APIFinder_Support')).toBeInTheDocument()
  })

  it('links the Discord community in a new tab when the card is open', async () => {
    const user = userEvent.setup()
    render(<SupportWidget />)

    await user.click(screen.getByRole('button', { name: 'Contact support' }))

    const link = await screen.findByRole('link', {
      name: /Join our Discord community/,
    })
    expect(link).toHaveAttribute('href', 'https://discord.gg/4dVPvrx2J')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it.each(['/setup', '/playground', '/chat', '/video-studio/abc'])(
    'renders no button on %s, which keeps its own controls in the corner',
    (pathname) => {
      routerState.pathname = pathname
      render(<SupportWidget />)

      expect(
        screen.queryByRole('button', { name: 'Contact support' })
      ).not.toBeInTheDocument()
    }
  )

  it.each(['/', '/pricing', '/chat2link', '/dashboard'])(
    'shows the button on %s',
    (pathname) => {
      routerState.pathname = pathname
      render(<SupportWidget />)

      expect(
        screen.getByRole('button', { name: 'Contact support' })
      ).toBeInTheDocument()
    }
  )
})
