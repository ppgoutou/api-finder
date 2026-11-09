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
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SystemStatus } from '../../types'
import {
  OAuthCallbackScreen,
  SLOW_CALLBACK_HINT_DELAY_MS,
} from '../oauth-callback-screen'

let mockStatus: SystemStatus | null = null

// /api/status is a network boundary; the screen only reads the OIDC fields.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: mockStatus, loading: false, error: null }),
}))

// The layout loads branding and showcase media; the screen's content is the
// subject here.
vi.mock('../../auth-layout', () => ({
  AuthLayout: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))

const SLOW_HINT = /You'll be redirected automatically/

afterEach(() => {
  mockStatus = null
  vi.useRealTimers()
})

describe('OAuthCallbackScreen', () => {
  it('names Google and shows its mark for an OIDC login through Google', () => {
    mockStatus = {
      oidc_display_name: 'Google',
      oidc_authorization_endpoint:
        'https://accounts.google.com/o/oauth2/v2/auth',
    } as SystemStatus

    render(<OAuthCallbackScreen provider='oidc' mode='login' />)

    expect(
      screen.getByRole('heading', { name: 'Signing you in with Google' })
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Google' })).toBeInTheDocument()
  })

  it('falls back to "OIDC" when no display name is configured', () => {
    mockStatus = {} as SystemStatus

    render(<OAuthCallbackScreen provider='oidc' mode='login' />)

    expect(
      screen.getByRole('heading', { name: 'Signing you in with OIDC' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'Google' })
    ).not.toBeInTheDocument()
  })

  it('hides the slow-callback hint until the delay passes', () => {
    vi.useFakeTimers()
    render(<OAuthCallbackScreen provider='github' mode='login' />)

    expect(screen.queryByText(SLOW_HINT)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(SLOW_CALLBACK_HINT_DELAY_MS)
    })

    expect(screen.getByText(SLOW_HINT)).toBeInTheDocument()
  })
})
