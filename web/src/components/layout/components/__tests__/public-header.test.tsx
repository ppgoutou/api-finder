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
import { describe, expect, it, vi } from 'vitest'

import { PublicHeader } from '../public-header'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: '/' } }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-top-nav-links', () => ({
  useTopNavLinks: () => [
    { title: 'Model Square', href: '/pricing' },
    { title: 'Docs', href: 'https://example.com/docs', external: true },
  ],
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'API-Finder',
    logo: '',
    loading: false,
    logoLoaded: true,
  }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({}),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ auth: { user: null } }),
}))
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => null,
}))
vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: () => null,
}))
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => null,
}))
vi.mock('@/features/system-update/system-update-action', () => ({
  SystemUpdateAction: () => null,
}))
vi.mock('../header-logo', () => ({ HeaderLogo: () => null }))

describe('PublicHeader desktop navigation', () => {
  it.each([
    ['internal', 'Model Square'],
    ['external', 'Docs'],
  ])(
    'keeps the full %s link label when the header runs out of space',
    (_kind, label) => {
      render(<PublicHeader />)

      // The first match is the desktop link; the mobile overlay renders the second.
      const link = screen.getAllByRole('link', { name: label })[0]

      expect(link).not.toHaveClass('truncate')
      expect(link).toHaveClass('shrink-0', 'whitespace-nowrap')
    }
  )
})
