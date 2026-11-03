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
import { HomeShowcaseSection } from '../section'

const UPLOADED = '/home-media/0123456789abcdef0123456789abcdef.mp4'
const OLD_CLIP = '/home-media/fedcba9876543210fedcba9876543210.mp4'

function Fixture(props: {
  defaultValue: string
  sharedMedia: readonly string[]
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <HomeShowcaseSection
          defaultValue={props.defaultValue}
          sharedMedia={props.sharedMedia}
        />
      </SettingsPageProvider>
    </>
  )
}

function renderSection(defaultValue = '', sharedMedia: readonly string[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture defaultValue={defaultValue} sharedMedia={sharedMedia} />
    </QueryClientProvider>
  )
}

function savedOption(): unknown {
  const call = vi
    .mocked(api.put)
    .mock.calls.find(([url]) => url === '/api/option/')
  if (!call) throw new Error('option was not saved')
  const body = call[1] as { key: string; value: string }
  expect(body.key).toBe('HomeShowcase')
  return JSON.parse(body.value)
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { url: UPLOADED } },
  })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: '' } })
})

describe('homepage video settings', () => {
  it('saves an added clip with its uploaded video', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: 'Add clip' }))
    const clip = screen.getByRole('region', { name: 'Clip 1' })
    await user.upload(
      within(clip).getByLabelText('Choose file for Video'),
      new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    )
    await waitFor(() =>
      expect(
        within(clip).getByRole('textbox', { name: 'Video URL' })
      ).toHaveValue(UPLOADED)
    )
    await user.type(
      within(clip).getByRole('textbox', { name: 'Title' }),
      'Chase'
    )
    await user.type(
      within(clip).getByRole('textbox', { name: 'Category' }),
      'Action'
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(savedOption()).toMatchObject({
      showcase: [{ title: 'Chase', category: 'Action', video: UPLOADED }],
    })
    expect(api.post).toHaveBeenCalledWith(
      '/api/home_media',
      expect.any(FormData),
      expect.any(Object)
    )
  })

  it('deletes the uploaded file of a removed clip after saving', async () => {
    const user = userEvent.setup()
    renderSection(
      JSON.stringify({ showcase: [{ title: 'Old', video: OLD_CLIP }] })
    )

    await user.click(screen.getByRole('button', { name: 'Remove clip 1' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        '/api/home_media/fedcba9876543210fedcba9876543210.mp4'
      )
    )
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'HomeShowcase',
      value: '',
    })
  })

  it('keeps the file of a removed clip when the studio gallery still uses it', async () => {
    const user = userEvent.setup()
    renderSection(
      JSON.stringify({ showcase: [{ title: 'Old', video: OLD_CLIP }] }),
      [OLD_CLIP]
    )

    await user.click(screen.getByRole('button', { name: 'Remove clip 1' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/option/', {
        key: 'HomeShowcase',
        value: '',
      })
    )
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('blocks saving a media link that is neither uploaded nor https', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: 'Edit Hero video' }))
    const hero = screen.getByRole('region', { name: 'Hero video' })
    const heroVideo = within(hero).getByRole('textbox', { name: 'Video URL' })
    await user.type(heroVideo, 'http://example.com/a.mp4')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(heroVideo).toHaveAttribute('aria-invalid', 'true')
    )
    expect(
      screen.getByText('Use an uploaded file or an https link')
    ).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('keeps existing clips collapsed behind a thumbnail until edited', async () => {
    const user = userEvent.setup()
    renderSection(
      JSON.stringify({
        showcase: [
          {
            title: 'Chase',
            category: 'Action',
            video: OLD_CLIP,
            poster: 'https://cdn.example/chase.jpg',
          },
        ],
      })
    )

    const clip = await screen.findByRole('region', { name: 'Clip 1' })
    expect(within(clip).getByText('Chase')).toBeVisible()
    expect(within(clip).getByText('Action')).toBeVisible()
    expect(
      within(clip).queryByRole('textbox', { name: 'Title' })
    ).not.toBeInTheDocument()

    await user.click(within(clip).getByRole('button', { name: 'Edit Chase' }))

    expect(within(clip).getByRole('textbox', { name: 'Title' })).toBeVisible()
  })
})
