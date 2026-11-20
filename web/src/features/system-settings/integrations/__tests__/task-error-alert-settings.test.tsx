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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import {
  TaskErrorAlertSettingsSection,
  type TaskErrorAlertFormValues,
} from '../task-error-alert-settings-section'

const SAVED: TaskErrorAlertFormValues = {
  enabled: false,
  merge_minutes: 10,
  user_summary_enabled: true,
  summary_minutes: 60,
  hourly_stats_enabled: true,
}

function Fixture(props: { values: TaskErrorAlertFormValues }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <TaskErrorAlertSettingsSection defaultValues={props.values} />
      </SettingsPageProvider>
    </>
  )
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture values={SAVED} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: null },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

test('turning alerts on and changing the summary interval saves only those two options', async () => {
  const user = userEvent.setup()
  renderSettings()

  await user.click(
    screen.getByRole('switch', { name: 'Enable task error alerts' })
  )
  const summary = screen.getByLabelText('Send the summary every (minutes)')
  await user.tripleClick(summary)
  await user.keyboard('120')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'task_error_alert_setting.enabled',
    value: true,
  })
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'task_error_alert_setting.summary_minutes',
    value: 120,
  })
})

test('a merge window of 0 minutes is rejected without saving', async () => {
  const user = userEvent.setup()
  renderSettings()

  const merge = screen.getByLabelText('Merge repeats for (minutes)')
  await user.tripleClick(merge)
  await user.keyboard('0')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(merge).toHaveAttribute('aria-invalid', 'true'))
  expect(api.put).not.toHaveBeenCalled()
})
