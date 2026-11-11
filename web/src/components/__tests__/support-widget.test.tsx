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

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options: {
    select: (state: { location: { pathname: string } }) => string
  }) => options.select({ location: { pathname: routerState.pathname } }),
}))

describe('support widget', () => {
  beforeEach(() => {
    routerState.pathname = '/'
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
