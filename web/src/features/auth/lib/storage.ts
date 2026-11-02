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
/**
 * Utilities for managing authentication-related browser storage
 */

// ============================================================================
// LocalStorage Keys
// ============================================================================

const STORAGE_KEYS = {
  AFFILIATE: 'aff',
  STATUS: 'status',
} as const

// ============================================================================
// Affiliate Code Storage
// ============================================================================

/** An invitation link is remembered for 30 days after the last visit. */
export const AFFILIATE_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000

type StoredAffiliateCode = { code: string; savedAt: number }

/**
 * Get the invitation code remembered from an invitation link, or '' once it
 * has expired. A plain string written by older builds has no timestamp and
 * is still returned.
 */
export function getAffiliateCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.AFFILIATE) ?? ''
    if (!raw.startsWith('{')) return raw
    const stored = JSON.parse(raw) as Partial<StoredAffiliateCode>
    if (typeof stored.code !== 'string') return ''
    if (Date.now() - Number(stored.savedAt) > AFFILIATE_CODE_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEYS.AFFILIATE)
      return ''
    }
    return stored.code
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to get affiliate code:', error)
    return ''
  }
}

/**
 * Remember an invitation code; the latest invitation link wins.
 */
export function saveAffiliateCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    const stored: StoredAffiliateCode = { code, savedAt: Date.now() }
    window.localStorage.setItem(STORAGE_KEYS.AFFILIATE, JSON.stringify(stored))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save affiliate code:', error)
  }
}
