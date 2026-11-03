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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createVideoTask, uploadVideoAsset } from '../api'
import { Composer } from '../components/composer'
import { STUDIO_RATIOS, type StudioModel } from '../constants'
import { draftFromVideoRequest } from '../lib/draft'
import type { VideoTaskRequest } from '../types'

const studioModels = vi.hoisted(() => ({ current: [] as StudioModel[] }))
const studioBalance = vi.hoisted(() => ({
  shortfallUSD: null as number | null,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; className?: string; children: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

vi.mock('../api', () => ({
  uploadVideoAsset: vi.fn(),
  createVideoTask: vi.fn(),
}))

vi.mock('../hooks/use-studio-models', () => ({
  useStudioModels: () => studioModels.current,
}))

vi.mock('../hooks/use-studio-price', () => ({
  useStudioPrice: () => ({ label: '¥0.75', costUSD: 0.11 }),
}))

vi.mock('../hooks/use-studio-balance', () => ({
  useStudioBalance: () => ({
    shortfallUSD: studioBalance.shortfallUSD,
    refresh: vi.fn(),
  }),
}))

const uploadMock = vi.mocked(uploadVideoAsset)
const createMock = vi.mocked(createVideoTask)

beforeEach(() => {
  studioBalance.shortfallUSD = null
  studioModels.current = [
    {
      name: 'seedance-2.0',
      resolutions: ['480p', '720p', '1080p', '4k'],
      duration: [4, 15],
      ratios: STUDIO_RATIOS,
    },
    {
      name: 'seedance-2.5',
      resolutions: ['480p', '720p', '1080p'],
      duration: [4, 30],
      ratios: STUDIO_RATIOS,
    },
    {
      name: 'seedance2.0-720p-P',
      resolutions: ['720p'],
      duration: [5, 15],
      ratios: STUDIO_RATIOS,
    },
  ]
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  )
  uploadMock.mockResolvedValue({
    success: true,
    data: {
      url: 'https://site.example/video-assets/cat.png',
      content_type: 'image/png',
      size: 4,
      expires_at: 0,
    },
  })
  createMock.mockResolvedValue('task_1')
  window.localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function uploadImage(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['png!'], 'cat.png', { type: 'image/png' })
  await user.upload(screen.getByLabelText('References'), file)
  await screen.findByText('@图片1')
}

describe('Composer', () => {
  it('inserts the token of an uploaded reference when @ is typed', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)

    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    await user.type(prompt, 'the cat in @')
    expect(screen.getByRole('option', { name: /@图片1/ })).toBeInTheDocument()
    await user.keyboard('{Enter}')

    expect(prompt).toHaveValue('the cat in @图片1 ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('submits the prompt with the uploaded reference URL and refreshes the works', async () => {
    const user = userEvent.setup()
    const onSubmitted = vi.fn()
    render(<Composer onSubmitted={onSubmitted} />)
    await uploadImage(user)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce())
    expect(createMock).toHaveBeenCalledOnce()
    expect(createMock).toHaveBeenCalledWith({
      model: 'seedance-2.0',
      prompt: 'a cat runs',
      seconds: 5,
      resolution: '720p',
      images: ['https://site.example/video-assets/cat.png'],
    })
    expect(screen.getByText('¥0.75')).toBeInTheDocument()
  })

  it('offers only the aspect ratios the model supports', async () => {
    studioModels.current = [
      {
        name: 'D-sd2.5-G3-1',
        resolutions: ['480p', '720p', '1080p'],
        duration: [4, 30],
        ratios: ['auto', '16:9', '1:1', '9:16'],
      },
    ]
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^Auto/ }))

    const ratios = within(screen.getByRole('group', { name: 'Aspect ratio' }))
    expect(
      ratios.getAllByRole('button').map((item) => item.textContent)
    ).toEqual(['Auto', '16:9', '1:1', '9:16'])
  })

  it('does not submit an empty prompt', async () => {
    const user = userEvent.setup()
    const onSubmitted = vi.fn()
    render(<Composer onSubmitted={onSubmitted} />)

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    expect(createMock).not.toHaveBeenCalled()
    expect(onSubmitted).not.toHaveBeenCalled()
  })

  it('removes the mention of a reference when the file is removed', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)
    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    await user.type(prompt, 'keep @')
    await user.keyboard('{Enter}')

    await user.click(screen.getByRole('button', { name: 'Remove cat.png' }))

    expect(prompt).toHaveValue('keep  ')
    expect(screen.queryByText('@图片1')).not.toBeInTheDocument()
  })

  it('lists every model from the pricing data and submits the picked one', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(
      screen.getByRole('button', { name: 'Model: seedance-2.0' })
    )
    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent)
    ).toEqual(['seedance-2.0', 'seedance-2.5', 'seedance2.0-720p-P'])
    await user.click(
      screen.getByRole('menuitemradio', { name: 'seedance2.0-720p-P' })
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock).toHaveBeenCalledWith({
      model: 'seedance2.0-720p-P',
      prompt: 'a cat runs',
      seconds: 5,
      resolution: '720p',
    })
  })

  it('loads a past reference request for editing and resubmits it unchanged', async () => {
    const past: VideoTaskRequest = {
      model: 'seedance-2.5',
      prompt: 'the dog in @图片1 dances to @音频1',
      seconds: 8,
      resolution: '1080p',
      ratio: '9:16',
      images: ['https://site.example/video-assets/dog.png'],
      audios: ['https://site.example/video-assets/song.mp3'],
    }
    const user = userEvent.setup()
    render(
      <Composer
        onSubmitted={vi.fn()}
        initialModel='seedance-2.0'
        initialDraft={draftFromVideoRequest(past)}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Video prompt' })).toHaveValue(
      past.prompt
    )
    expect(
      screen.getByRole('button', { name: 'Model: seedance-2.5' })
    ).toBeInTheDocument()
    expect(screen.getByText('@图片1')).toBeInTheDocument()
    expect(screen.getByText('@音频1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock).toHaveBeenCalledWith(past)
  })

  it('loads a past first-and-last-frame request back into frames mode', async () => {
    const past: VideoTaskRequest = {
      model: 'seedance-2.0',
      prompt: 'the sun sets',
      seconds: 5,
      resolution: '720p',
      first_image_url: 'https://site.example/video-assets/day.png',
      last_image_url: 'https://site.example/video-assets/night.png',
    }
    const user = userEvent.setup()
    render(
      <Composer
        onSubmitted={vi.fn()}
        initialDraft={draftFromVideoRequest(past)}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock).toHaveBeenCalledWith(past)
  })

  it('preselects the model it was opened with', () => {
    render(<Composer onSubmitted={vi.fn()} initialModel='seedance2.0-720p-P' />)
    expect(
      screen.getByRole('button', { name: 'Model: seedance2.0-720p-P' })
    ).toBeInTheDocument()
  })

  it('falls back to the first model when opened with an unavailable one', () => {
    render(<Composer onSubmitted={vi.fn()} initialModel='retired-model' />)
    expect(
      screen.getByRole('button', { name: 'Model: seedance-2.0' })
    ).toBeInTheDocument()
  })

  it('heads the models of each plaza category with the category name', async () => {
    studioModels.current = [
      { ...studioModels.current[1], group: 'Seedance 2.5' },
      { ...studioModels.current[0], group: 'Seedance 2.0' },
      { ...studioModels.current[2], group: '' },
    ]
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^Model:/ }))

    expect(screen.getByText('Seedance 2.5')).toBeInTheDocument()
    expect(screen.getByText('Seedance 2.0')).toBeInTheDocument()
    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent)
    ).toEqual(['seedance-2.5', 'seedance-2.0', 'seedance2.0-720p-P'])
  })

  it('keeps each model name of the model menu on a single line', async () => {
    studioModels.current = [
      {
        name: 'seedance-2.5-g4-m1-官转',
        resolutions: ['720p'],
        duration: [4, 15],
        ratios: STUDIO_RATIOS,
      },
    ]
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(
      screen.getByRole('button', { name: 'Model: seedance-2.5-g4-m1-官转' })
    )

    const item = screen.getByRole('menuitemradio', {
      name: 'seedance-2.5-g4-m1-官转',
    })
    expect(item).toHaveClass('whitespace-nowrap')
  })

  it('hides the model menu and does not submit while no model is available', async () => {
    studioModels.current = []
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    expect(
      screen.queryByRole('button', { name: /^Model:/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generate video' })
    ).toHaveAttribute('title', 'No video model is available')
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('Composer balance check', () => {
  it('shows the shortfall with a top-up link and blocks submission when the wallet falls short', async () => {
    studioBalance.shortfallUSD = 0.5
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Insufficient balance')
    expect(
      within(alert).getByRole('link', { name: 'Go to top up' })
    ).toHaveAttribute('href', '/wallet')
    const button = screen.getByRole('button', { name: 'Generate video' })
    expect(button).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      '{Enter}'
    )
    expect(createMock).not.toHaveBeenCalled()
  })

  it('keeps the generate button enabled without a shortfall notice when the balance covers the cost', () => {
    render(<Composer onSubmitted={vi.fn()} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  })
})

describe('Composer prompt length guide', () => {
  it('describes the empty prompt with the Seedance advice and caps it at 7500 characters', () => {
    render(<Composer onSubmitted={vi.fn()} />)

    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    expect(prompt).toHaveAttribute('maxLength', '7500')
    expect(prompt).toHaveAccessibleDescription(/Seedance works best/)
  })

  it('caps the prompt at 2000 characters with the MiniMax hint when a MiniMax model is picked', () => {
    studioModels.current = [
      {
        name: 'H-MiniMax-H3-Fast',
        resolutions: ['768p', '1080p'],
        duration: [4, 15],
        ratios: STUDIO_RATIOS,
      },
    ]
    render(<Composer onSubmitted={vi.fn()} />)

    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    expect(prompt).toHaveAttribute('maxLength', '2000')
    expect(prompt).toHaveAccessibleDescription(/MiniMax takes up to 2,000/)
  })

  it('hides the hint from view once the user starts typing', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    const hint = screen.getByText(/Seedance works best/)
    expect(hint).not.toHaveClass('sr-only')

    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat'
    )

    expect(hint).toHaveClass('sr-only')
  })
})
