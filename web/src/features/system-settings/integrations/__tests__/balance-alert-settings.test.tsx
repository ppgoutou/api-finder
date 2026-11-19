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
import { parseBalanceAlertMonitors } from '../balance-alert-api'
import {
  BalanceAlertSettingsSection,
  type BalanceAlertFormValues,
} from '../balance-alert-settings-section'

const SAVED: BalanceAlertFormValues = {
  enabled: true,
  feishu_webhook_url: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc',
  feishu_sign_secret: '',
  interval_minutes: 10,
  repeat_minutes: 360,
  report_enabled: false,
  report_minutes: 0,
  monitors: [],
}

function Fixture(props: { values: BalanceAlertFormValues }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <BalanceAlertSettingsSection defaultValues={props.values} />
      </SettingsPageProvider>
    </>
  )
}

function renderSettings(values: BalanceAlertFormValues = SAVED) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture values={values} />
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

test('adding a channel with divide by 10 saves the monitor list as JSON', async () => {
  const user = userEvent.setup()
  renderSettings()

  await user.click(screen.getByRole('button', { name: 'Add channel' }))
  const channelId = screen.getByLabelText('Channel ID')
  await user.clear(channelId)
  await user.type(channelId, '11')
  const divisor = screen.getByLabelText('Divide by')
  await user.tripleClick(divisor)
  await user.keyboard('10')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'balance_alert_setting.monitors',
    value: JSON.stringify([
      {
        channel_id: 11,
        path: '/balance',
        field: 'balance',
        threshold: 100,
        divisor: 10,
        unit: 'CNY',
      },
    ]),
  })
})

test('a blank signature secret keeps the saved one and a new one is sent then cleared', async () => {
  const user = userEvent.setup()
  renderSettings()

  const secret = screen.getByLabelText('Signature secret')
  await user.type(secret, ' s3cret ')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'balance_alert_setting.feishu_sign_secret',
    value: 's3cret',
  })
  await waitFor(() => expect(secret).toHaveValue(''))
})

test('a webhook URL that is not a Feishu bot is rejected without saving', async () => {
  const user = userEvent.setup()
  renderSettings()

  const url = screen.getByLabelText('Feishu bot webhook URL')
  await user.clear(url)
  await user.type(url, 'https://example.com/hook')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  expect(
    await screen.findByText(
      'Use a Feishu bot webhook URL, like https://open.feishu.cn/open-apis/bot/v2/hook/...'
    )
  ).toBeVisible()
  expect(api.put).not.toHaveBeenCalled()
})

test('check balances now lists each balance or error without saving', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          channel_id: 11,
          channel_name: 'YH',
          balance: 88.5,
          threshold: 100,
          unit: 'CNY',
          raw: '{"balance":88.5}',
        },
        {
          channel_id: 12,
          channel_name: 'Other',
          threshold: 10,
          unit: 'USD',
          error: 'upstream returned HTTP 401',
        },
      ],
    },
  })
  renderSettings()

  await user.click(screen.getByRole('button', { name: 'Check balances now' }))

  const results = await screen.findByRole('list', {
    name: 'Balance check results',
  })
  expect(results).toHaveTextContent('YH #11')
  expect(results).toHaveTextContent('88.5 CNY')
  expect(results).toHaveTextContent('upstream returned HTTP 401')
  expect(api.post).toHaveBeenCalledWith('/api/option/balance_alert/check')
  expect(api.put).not.toHaveBeenCalled()
})

test('saved monitors JSON is parsed and unreadable values become an empty list', () => {
  expect(
    parseBalanceAlertMonitors(
      '[{"channel_id":11,"path":"/balance","field":"balance","threshold":50,"unit":"CNY"}]'
    )
  ).toEqual([
    {
      channel_id: 11,
      path: '/balance',
      field: 'balance',
      threshold: 50,
      divisor: 1,
      unit: 'CNY',
    },
  ])
  expect(parseBalanceAlertMonitors('not json')).toEqual([])
  expect(parseBalanceAlertMonitors('{"a":1}')).toEqual([])
})

test('turning on reports every 180 minutes with a 30 minute repeat saves all three options', async () => {
  const user = userEvent.setup()
  renderSettings()

  await user.click(
    screen.getByRole('switch', { name: 'Send a balance report on every check' })
  )
  const repeat = screen.getByLabelText('Repeat reminder every (minutes)')
  await user.tripleClick(repeat)
  await user.keyboard('30')
  const report = screen.getByLabelText('Report every (minutes)')
  await user.tripleClick(report)
  await user.keyboard('180')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(3))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'balance_alert_setting.report_minutes',
    value: 180,
  })
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'balance_alert_setting.repeat_minutes',
    value: 30,
  })
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'balance_alert_setting.report_enabled',
    value: true,
  })
})
