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
import { render, screen, within } from '@testing-library/react'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { usageLogSchema } from '../../data/schema'
import { getLogColumnMode, type LogColumnMode } from '../../lib/topup-log'
import { useCommonLogsColumns } from '../columns/common-logs-columns'
import { UsageLogsMobileList } from '../usage-logs-mobile-card'
import { UsageLogsProvider } from '../usage-logs-provider'

// Provider icons are unused by top-up logs; their browser-only dependencies
// cannot be loaded by Vitest's Node ESM resolver.
vi.mock('@lobehub/icons', () => ({}))

vi.hoisted(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterAll(() => vi.unstubAllGlobals())

function topupLog(other: object) {
  return usageLogSchema.parse({
    id: 1,
    user_id: 2,
    created_at: 1788840000,
    type: 1,
    content: '',
    username: 'buyer',
    other: JSON.stringify(other),
  })
}

const onlineLog = topupLog({
  content_parts: [
    {
      key: 'Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}',
      params: { quota: '¥68.000000', amount: 68 },
    },
  ],
})

function Fixture(props: {
  mode: LogColumnMode
  logs: ReturnType<typeof topupLog>[]
  mobile?: boolean
}) {
  const columns = useCommonLogsColumns(true, false, false, props.mode)
  const table = useReactTable({
    data: props.logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  if (props.mobile) {
    return <UsageLogsMobileList table={table} logCategory='common' />
  }
  return (
    <table>
      <thead>
        <tr>
          {table.getFlatHeaders().map((header) => (
            <th key={header.id}>
              {flexRender(header.column.columnDef.header, header.getContext())}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderFixture(props: Parameters<typeof Fixture>[0]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UsageLogsProvider>
        <Fixture {...props} />
      </UsageLogsProvider>
    </QueryClientProvider>
  )
}

function headers() {
  return screen.getAllByRole('columnheader').map((item) => item.textContent)
}

function rowText() {
  const row = screen.getAllByRole('row')[1]
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

describe('log column mode', () => {
  test.each([
    { selected: undefined, expected: 'default' },
    { selected: [], expected: 'default' },
    { selected: ['2'], expected: 'default' },
    { selected: ['1', '2'], expected: 'default' },
    { selected: ['1'], expected: 'topup' },
    { selected: [1], expected: 'topup' },
    { selected: ['1', '3'], expected: 'no-usage' },
    { selected: ['7'], expected: 'no-usage' },
  ])('selecting $selected uses $expected', ({ selected, expected }) => {
    expect(getLogColumnMode(selected)).toBe(expected)
  })
})

describe('top-up log columns', () => {
  test('default mode keeps the usage columns and adds no top-up columns', () => {
    renderFixture({ mode: 'default', logs: [onlineLog] })

    expect(headers()).toEqual(expect.arrayContaining(['Model', 'Cost']))
    expect(headers()).not.toContain('Top-up Method')
  })

  test('top-up mode replaces the usage columns with method and amount before details', () => {
    renderFixture({ mode: 'topup', logs: [onlineLog] })

    expect(headers()).toEqual([
      'Time',
      'User',
      'Top-up Method',
      'Top-up amount',
      'Details',
    ])
  })

  test('no-usage mode hides the usage columns without adding top-up columns', () => {
    renderFixture({ mode: 'no-usage', logs: [onlineLog] })

    expect(headers()).toEqual(['Time', 'User', 'Details'])
  })

  test.each([
    {
      name: 'online top-up',
      other: onlineLog.other,
      method: 'Online Top-up',
      amount: '¥68',
      detail: 'Payment amount: 68',
    },
    {
      name: 'redemption code',
      other: JSON.stringify({
        content_parts: [
          {
            key: 'Topped up {{quota}} with a redemption code, code ID {{id}}',
            params: { quota: '＄10.500000', id: 7 },
          },
        ],
      }),
      method: 'Redemption Code Top-up',
      amount: '$10.5',
      detail: 'Redemption code ID: 7',
    },
    {
      name: 'administrator increase',
      other: JSON.stringify({
        op: {
          action: 'user.quota_add',
          params: { quota: 500000, from: 500000, to: 1000000 },
        },
      }),
      method: 'Administrator Quota Increase',
      amount: '$1',
      detail: 'Requested quota: $1 · $1 → $2',
    },
    {
      name: 'administrator decrease',
      other: JSON.stringify({
        op: {
          action: 'user.quota_subtract',
          params: { quota: 500000, from: 1000000, to: 500000 },
        },
      }),
      method: 'Administrator Quota Decrease',
      amount: '-$1',
      detail: 'Requested quota: $1 · $2 → $1',
    },
    {
      name: 'administrator override',
      other: JSON.stringify({
        op: {
          action: 'user.quota_override',
          params: { from: 1000000, to: 500000 },
        },
      }),
      method: 'Administrator Quota Override',
      amount: '-$1',
      detail: 'Requested quota: $1 · $2 → $1',
    },
  ])(
    '$name splits into method, amount and the remaining detail',
    ({ other, method, amount, detail }) => {
      renderFixture({ mode: 'topup', logs: [{ ...onlineLog, other }] })

      const cells = rowText()
      expect(cells[2]).toBe(method)
      expect(cells[3]).toBe(amount)
      expect(cells[4]).toBe(detail)
    }
  )

  test('an unrecognised top-up log shows dashes and keeps its full details', () => {
    const key =
      'Stripe dispute closed in your favor, top-up quota restored: {{quota}}'
    renderFixture({
      mode: 'topup',
      logs: [
        topupLog({ content_parts: [{ key, params: { quota: '$1.000000' } }] }),
      ],
    })

    const cells = rowText()
    expect(cells[2]).toBe('—')
    expect(cells[3]).toBe('—')
    expect(cells[4]).toContain('Stripe dispute closed')
  })

  test('the mobile card shows the method and amount in top-up mode', () => {
    renderFixture({ mode: 'topup', logs: [onlineLog], mobile: true })

    expect(screen.getByText('Top-up Method')).toBeTruthy()
    expect(screen.getByText('Online Top-up')).toBeTruthy()
    expect(screen.getByText('¥68')).toBeTruthy()
  })
})
