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
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { useSidebarData } from '../use-sidebar-data'

function dashboardEntry() {
  const { result } = renderHook(() => useSidebarData())
  const items = result.current.navGroups.flatMap((group) => group.items)
  return items.find((item) => item.title === 'Dashboard') as {
    url: string
    activeUrls?: string[]
  }
}

function signInWithRole(role: number) {
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: { ...state.auth.user, role } as never },
  }))
}

describe('useSidebarData dashboard entry', () => {
  afterEach(() => {
    useAuthStore.setState((state) => ({
      auth: { ...state.auth, user: null },
    }))
  })

  it('opens the business dashboard for administrators and stays active on its other tabs', () => {
    signInWithRole(ROLE.ADMIN)
    const entry = dashboardEntry()
    expect(entry.url).toBe('/dashboard/operations')
    expect(entry.activeUrls).toContain('/dashboard/models')
  })

  it('opens model analytics for regular users', () => {
    signInWithRole(ROLE.USER)
    expect(dashboardEntry().url).toBe('/dashboard/models')
  })
})
