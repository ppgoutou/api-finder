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
import { describe, expect, it, vi } from 'vitest'

import type { SystemStatus } from '../../types'
import { OAuthProviders } from '../oauth-providers'

// The hook starts real OAuth redirects; the buttons only need its handlers.
vi.mock('../../hooks/use-oauth-login', () => ({
  useOAuthLogin: () => ({
    isLoading: false,
    githubButtonText: '',
    githubButtonDisabled: false,
    handleGitHubLogin: vi.fn(),
    handleDiscordLogin: vi.fn(),
    handleOIDCLogin: vi.fn(),
    handleLinuxDOLogin: vi.fn(),
    handleTelegramLogin: vi.fn(),
    handleCustomOAuthLogin: vi.fn(),
  }),
}))

function oidcStatus(authorizationEndpoint: string): SystemStatus {
  return {
    oidc_enabled: true,
    oidc_display_name: 'Google',
    oidc_authorization_endpoint: authorizationEndpoint,
  } as SystemStatus
}

describe('OAuthProviders', () => {
  it('shows the Google mark when OIDC authorizes at accounts.google.com', () => {
    render(
      <OAuthProviders
        status={oidcStatus('https://accounts.google.com/o/oauth2/v2/auth')}
      />
    )

    const button = screen.getByRole('button', { name: /Continue with Google/ })
    expect(
      within(button).getByRole('img', { name: 'Google' })
    ).toBeInTheDocument()
  })

  it('shows no Google mark for another OIDC provider named Google', () => {
    render(
      <OAuthProviders
        status={oidcStatus('https://sso.example.com/authorize')}
      />
    )

    const button = screen.getByRole('button', { name: /Continue with Google/ })
    expect(within(button).queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows no Google mark when the endpoint is not a valid URL', () => {
    render(<OAuthProviders status={oidcStatus('accounts.google.com')} />)

    const button = screen.getByRole('button', { name: /Continue with Google/ })
    expect(within(button).queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the "Or continue with" divider by default', () => {
    render(
      <OAuthProviders
        status={oidcStatus('https://accounts.google.com/o/oauth2/v2/auth')}
      />
    )

    expect(screen.getByText('Or continue with')).toBeInTheDocument()
  })

  it('hides the divider when showDivider is false', () => {
    render(
      <OAuthProviders
        status={oidcStatus('https://accounts.google.com/o/oauth2/v2/auth')}
        showDivider={false}
      />
    )

    expect(screen.queryByText('Or continue with')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Continue with Google/ })
    ).toBeInTheDocument()
  })
})
