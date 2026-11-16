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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { Row } from '@tanstack/react-table'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import type { User } from '../../types'
import { DataTableRowActions } from '../data-table-row-actions'
import { UsersProvider } from '../users-provider'

const target: User = {
  id: 2,
  username: 'managed-user',
  display_name: 'Managed user',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
}

afterEach(() => cleanup())

it('opens the common usage logs filtered to the user from the row menu', async () => {
  const root = createRootRoute()
  const users = createRoute({
    getParentRoute: () => root,
    path: '/users',
    component: () => (
      <UsersProvider>
        <DataTableRowActions row={{ original: target } as Row<User>} />
      </UsersProvider>
    ),
  })
  const logs = createRoute({
    getParentRoute: () => root,
    path: '/usage-logs/$section',
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([users, logs]),
    history: createMemoryHistory({ initialEntries: ['/users'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  await userEvent.click(
    await screen.findByRole('button', { name: 'Open menu' })
  )
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'View Usage Logs' })
  )

  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/usage-logs/common')
  )
  expect(router.state.location.search).toEqual({ username: 'managed-user' })
})
