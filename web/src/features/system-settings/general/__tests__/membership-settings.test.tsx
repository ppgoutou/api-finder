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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { MembershipSettingsSection } from '../membership-settings-section'

function Fixture(props: { extraGroupPairs: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <MembershipSettingsSection
          defaultValues={{
            enabled: true,
            baseGroup: 'default',
            vipGroup: 'vip',
            extraGroupPairs: props.extraGroupPairs,
            totalTopUpUsd: 1000,
            singleTopUpUsd: 500,
            downgradeOnReversal: true,
            vipSupportTelegram: '',
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

async function renderSettings(extraGroupPairs: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Fixture extraGroupPairs={extraGroupPairs} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('More standard and VIP groups')
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})
afterEach(() => {
  vi.restoreAllMocks()
})

test('adding an overseas pair saves it as a standard-to-VIP map', async () => {
  const user = userEvent.setup()
  await renderSettings('null')

  await user.click(screen.getByRole('button', { name: 'Add Row' }))
  await user.type(screen.getByPlaceholderText('overseas'), 'overseas')
  await user.type(screen.getByPlaceholderText('vip-overseas'), 'vip-overseas')
  await user.click(
    screen.getByRole('button', { name: 'Save VIP membership settings' })
  )

  await waitFor(() => expect(api.put).toHaveBeenCalled())
  const saved = vi
    .mocked(api.put)
    .mock.calls.find(
      ([, body]) =>
        (body as { key: string }).key === 'membership_setting.extra_group_pairs'
    )
  expect(saved).toBeDefined()
  const body = saved?.[1] as { value: string } | undefined
  expect(JSON.parse(body?.value ?? '')).toEqual({
    overseas: 'vip-overseas',
  })
})

test('removing the last pair saves an empty map so the old pair is cleared', async () => {
  const user = userEvent.setup()
  await renderSettings('{"overseas":"vip-overseas"}')

  await user.click(screen.getByRole('button', { name: 'Delete row' }))
  await user.click(
    screen.getByRole('button', { name: 'Save VIP membership settings' })
  )

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'membership_setting.extra_group_pairs',
      value: '{}',
    })
  )
})

test('a standard group without a VIP group shows an error and is not saved', async () => {
  const user = userEvent.setup()
  await renderSettings('')

  await user.click(screen.getByRole('button', { name: 'Add Row' }))
  await user.type(screen.getByPlaceholderText('overseas'), 'overseas')
  await user.click(
    screen.getByRole('button', { name: 'Save VIP membership settings' })
  )

  expect(
    await screen.findByText('Enter a group name for every row')
  ).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
})
