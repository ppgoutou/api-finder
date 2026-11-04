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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../../components/settings-page-context'
import { PromoPopupSection } from '../section'

function Fixture(props: { stored: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <PromoPopupSection defaultValue={props.stored} />
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
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

describe('promotion popup settings', () => {
  it('saves a new model card under the PromoPopup option', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: 'Add card' }))
    await user.type(
      await screen.findByRole('textbox', { name: 'Model name' }),
      'Seedance 2.5'
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Sale price' }),
      '¥0.10'
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const body = vi.mocked(api.put).mock.calls[0][1] as {
      key: string
      value: string
    }
    expect(body.key).toBe('PromoPopup')
    expect(JSON.parse(body.value).cards[0]).toMatchObject({
      kind: 'model',
      model_name: 'Seedance 2.5',
      sale_price: '¥0.10',
    })
  })

  it('opens a collapsed card and blocks saving when it is incomplete', async () => {
    const user = userEvent.setup()
    renderSection(
      JSON.stringify({
        enabled: true,
        cards: [{ kind: 'model', title: 'Sale' }],
      })
    )

    expect(
      screen.queryByRole('textbox', { name: 'Model name' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(
      await screen.findByRole('textbox', { name: 'Model name' })
    ).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('rejects a script link', async () => {
    const user = userEvent.setup()
    renderSection(
      JSON.stringify({
        enabled: true,
        cards: [
          {
            kind: 'model',
            model_name: 'Seedance 2.5',
            sale_price: '¥0.10',
            href: 'javascript:alert(1)',
          },
        ],
      })
    )

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(
      await screen.findByText('Use a path starting with / or an https link')
    ).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('keeps preview disabled until a card has its required content', async () => {
    const user = userEvent.setup()
    renderSection()
    const preview = screen.getByRole('button', { name: 'Preview' })
    expect(preview).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Add card' }))
    await user.type(
      await screen.findByRole('textbox', { name: 'Model name' }),
      'Seedance 2.5'
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Sale price' }),
      '¥0.10'
    )

    expect(preview).toBeEnabled()
  })
})
