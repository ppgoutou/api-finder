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
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, expect, it, vi } from 'vitest'

import { usageLogSchema } from '../../data/schema'
import { useCommonLogsColumns } from '../columns/common-logs-columns'
import { UsageLogsProvider, useUsageLogsContext } from '../usage-logs-provider'

// Provider icons are unused here; their browser-only dependencies cannot be
// loaded by Vitest's Node ESM resolver.
vi.mock('@lobehub/icons', () => ({}))

vi.hoisted(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterAll(() => vi.unstubAllGlobals())
afterEach(() => cleanup())

const log = usageLogSchema.parse({
  id: 1,
  user_id: 42,
  created_at: 1788840000,
  type: 2,
  content: '',
  username: 'gvelt',
  model_name: 'seedance-2.5',
})

function OpenedUser() {
  const context = useUsageLogsContext()
  return context.userInfoDialogOpen ? (
    <output>{`user ${context.selectedUserId}`}</output>
  ) : null
}

function UserCell() {
  const columns = useCommonLogsColumns(true, false, false, 'default')
  const table = useReactTable({
    data: [log],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  const cell = table
    .getRowModel()
    .rows[0].getVisibleCells()
    .find((item) => item.column.id === 'user')
  if (!cell) return null
  return <div>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
}

function renderCell(onShowUserLogs?: (username: string) => void) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UsageLogsProvider onShowUserLogs={onShowUserLogs}>
        <UserCell />
        <OpenedUser />
      </UsageLogsProvider>
    </QueryClientProvider>
  )
}

it('filters the logs to the clicked user when choosing Only this user', async () => {
  const onShowUserLogs = vi.fn()
  renderCell(onShowUserLogs)
  await userEvent.click(screen.getByRole('button', { name: 'User: gvelt' }))
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Only this user' })
  )
  expect(onShowUserLogs).toHaveBeenCalledWith('gvelt')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('still opens the user information from the menu', async () => {
  renderCell(vi.fn())
  await userEvent.click(screen.getByRole('button', { name: 'User: gvelt' }))
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'User Information' })
  )
  expect(screen.getByRole('status')).toHaveTextContent('user 42')
})

it('offers only the user information where the page cannot filter', async () => {
  renderCell()
  await userEvent.click(screen.getByRole('button', { name: 'User: gvelt' }))
  expect(
    await screen.findByRole('menuitem', { name: 'User Information' })
  ).toBeVisible()
  expect(
    screen.queryByRole('menuitem', { name: 'Only this user' })
  ).not.toBeInTheDocument()
})
