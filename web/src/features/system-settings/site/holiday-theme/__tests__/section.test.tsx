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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../../components/settings-page-context'
import { HolidayThemeSection } from '../section'

function Fixture(props: { stored: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <HolidayThemeSection defaultValue={props.stored} />
      </SettingsPageProvider>
    </>
  )
}

function renderSection(stored = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture stored={stored} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

describe('holiday theme settings', () => {
  it('saves the Christmas dates under the HolidayTheme option', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('switch', { name: 'Christmas theme' }))
    fireEvent.change(screen.getByLabelText('First day'), {
      target: { value: '2026-12-15' },
    })
    fireEvent.change(screen.getByLabelText('Last day'), {
      target: { value: '2027-01-02' },
    })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const body = vi.mocked(api.put).mock.calls[0][1] as {
      key: string
      value: string
    }
    expect(body.key).toBe('HolidayTheme')
    expect(JSON.parse(body.value)).toEqual({
      theme: 'christmas',
      start: '2026-12-15',
      end: '2027-01-02',
    })
  })

  it('blocks saving when the last day is before the first day', async () => {
    const user = userEvent.setup()
    renderSection(
      '{"theme":"christmas","start":"2026-12-26","end":"2026-12-26"}'
    )

    fireEvent.change(screen.getByLabelText('Last day'), {
      target: { value: '2026-12-20' },
    })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(
      await screen.findByText('The last day must not be before the first day')
    ).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('stores an empty option when the theme is turned off', async () => {
    const user = userEvent.setup()
    renderSection(
      '{"theme":"christmas","start":"2026-12-15","end":"2027-01-02"}'
    )

    await user.click(screen.getByRole('switch', { name: 'Christmas theme' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({
      key: 'HolidayTheme',
      value: '',
    })
  })
})
