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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../../components/settings-page-context'
import { StudioGallerySection } from '../section'

const STORED = JSON.stringify({
  items: [{ title: 'Ocean drone', prompt: 'waves at sunrise' }],
})

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <StudioGallerySection defaultValue={STORED} sharedMedia={[]} />
      </SettingsPageProvider>
    </>
  )
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
})

describe('studio gallery settings', () => {
  it('adds a new clip above the existing ones and opens it when Add clip is pressed', async () => {
    const user = userEvent.setup()
    renderSection()

    const add = await screen.findByRole('button', { name: 'Add clip' })
    const existing = screen.getByRole('region', { name: 'Clip 1' })
    expect(
      add.compareDocumentPosition(existing) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    await user.click(add)

    const added = screen.getByRole('region', { name: 'Clip 1' })
    await waitFor(() =>
      expect(within(added).getByLabelText('Title')).toBeVisible()
    )
    expect(
      within(screen.getByRole('region', { name: 'Clip 2' })).getByText(
        'Ocean drone'
      )
    ).toBeInTheDocument()
  })

  it('keeps a clip when its removal is cancelled', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(
      await screen.findByRole('button', { name: 'Remove clip 1' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Ocean drone')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(screen.getByRole('region', { name: 'Clip 1' })).toBeInTheDocument()
  })

  it('removes a clip only after the removal is confirmed', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(
      await screen.findByRole('button', { name: 'Remove clip 1' })
    )
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Clip 1' })
      ).not.toBeInTheDocument()
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/option/', {
        key: 'StudioGallery',
        value: '',
      })
    )
  })
})
