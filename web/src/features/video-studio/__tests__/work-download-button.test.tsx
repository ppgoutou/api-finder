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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkDownloadButton } from '../components/work-download-button'

const URL_A = 'https://site.example/v1/tasks/task_1/artifacts/video/content'

function partialResponse() {
  return new Response(new Uint8Array(16), {
    status: 206,
    headers: { 'Content-Range': 'bytes 0-15/16', 'Content-Type': 'video/mp4' },
  })
}

function renderButton() {
  const saved: { href: string; filename: string; target: string }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    saved.push({
      href: this.href,
      filename: this.download,
      target: this.target,
    })
  })
  render(<WorkDownloadButton url={URL_A} filename='task_1.mp4' />)
  return saved
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('WorkDownloadButton', () => {
  it('keeps a real download link for download managers and new tabs', () => {
    renderButton()

    const link = screen.getByRole('button', { name: 'Download video' })
    expect(link).toHaveAttribute('href', URL_A)
    expect(link).toHaveAttribute('download', 'task_1.mp4')
  })

  it('saves the joined file under the task name when clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => partialResponse())
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:joined')
    const saved = renderButton()

    await userEvent.click(
      screen.getByRole('button', { name: 'Download video' })
    )

    await waitFor(() =>
      expect(saved).toEqual([
        { href: 'blob:joined', filename: 'task_1.mp4', target: '' },
      ])
    )
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false')
    )
  })

  it('falls back to the ordinary link in a new tab when ranges are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(16), { status: 200 }))
    )
    const saved = renderButton()

    await userEvent.click(
      screen.getByRole('button', { name: 'Download video' })
    )

    await waitFor(() =>
      expect(saved).toEqual([
        { href: URL_A, filename: 'task_1.mp4', target: '_blank' },
      ])
    )
  })

  it('shows the progress and ignores further clicks while downloading', async () => {
    let finish: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    renderButton()

    await userEvent.click(
      screen.getByRole('button', { name: 'Download video' })
    )
    const busy = screen.getByRole('button', { name: 'Downloading' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveTextContent('0%')

    await userEvent.click(busy)
    expect(fetchMock).toHaveBeenCalledOnce()

    finish(partialResponse())
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Download video' })
      ).toBeInTheDocument()
    )
  })
})
