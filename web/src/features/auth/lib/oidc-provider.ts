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
import type { SystemStatus } from '../types'

const GOOGLE_AUTHORIZATION_HOST = 'accounts.google.com'

/**
 * Whether the configured OIDC provider is Google, judged by where it
 * authorizes. The display name is admin text and may say "Google" for any
 * provider, so it is not trusted for the brand mark.
 */
export function isGoogleOIDC(status: SystemStatus | null | undefined): boolean {
  const endpoint = status?.oidc_authorization_endpoint
  if (!endpoint) return false
  try {
    return new URL(endpoint).hostname === GOOGLE_AUTHORIZATION_HOST
  } catch {
    return false
  }
}

/** The name shown for the OIDC provider, falling back to "OIDC". */
export function getOIDCDisplayName(
  status: SystemStatus | null | undefined
): string {
  return status?.oidc_display_name?.trim() || 'OIDC'
}
