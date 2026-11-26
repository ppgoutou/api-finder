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
  fireEvent,
  render as renderTree,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioPending } from '@/stores/studio-pending-store'

import { createVideoTask, uploadVideoAsset } from '../api'
import { Composer } from '../components/composer'
import { STUDIO_RATIOS, type StudioModel } from '../constants'
import { draftFromVideoRequest } from '../lib/draft'
import type { VideoTaskRequest } from '../types'

const studioModels = vi.hoisted(() => ({ current: [] as StudioModel[] }))
const studioPrice = vi.hoisted(() => ({ perVideo: false }))
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

vi.mock('@/features/wallet/components/quick-topup-dialog', () => ({
  QuickTopupDialog: (props: { shortfallUSD: number; returnPage: string }) => (
    <div role='dialog' aria-label='Quick top-up'>
      {`${props.shortfallUSD} ${props.returnPage}`}
    </div>
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
  useStudioPricer: () => () => ({
    label: '¥0.75',
    costUSD: 0.11,
    unitLabel: '¥0.15',
    perVideo: studioPrice.perVideo,
  }),
}))

vi.mock('../hooks/use-studio-balance', () => ({
  useStudioBalance: () => ({
    shortfallUSD: studioBalance.shortfallUSD,
    refresh: vi.fn(),
  }),
}))

function render(ui: ReactNode) {
  return renderTree(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  )
}

const uploadMock = vi.mocked(uploadVideoAsset)
const createMock = vi.mocked(createVideoTask)

beforeEach(() => {
  studioBalance.shortfallUSD = null
  studioPrice.perVideo = false
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
  useStudioPending.setState({ videos: [] })
  window.localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

async function uploadImage(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['png!'], 'cat.png', { type: 'image/png' })
  await user.upload(screen.getByLabelText('References'), file)
  await screen.findByText('@Image1')
}

describe('Composer', () => {
  it('inserts the mention in the interface language when @ is typed', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)

    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    await user.type(prompt, 'the cat in @')
    expect(screen.getByRole('option', { name: /@Image1/ })).toBeInTheDocument()
    await user.keyboard('{Enter}')

    expect(prompt).toHaveValue('the cat in @Image1 ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('highlights mentions of uploaded references and not of missing ones', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'the cat in @Image1 meets @Image2'
    )

    const layer = screen.getByTestId('prompt-mention-layer')
    const marks = within(layer)
      .queryAllByText(/^@Image\d$/)
      .filter((element) => element.tagName === 'MARK')
    expect(marks.map((mark) => mark.textContent)).toEqual(['@Image1'])
  })

  it('sends a localized mention to the model as its Chinese token', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'the cat in @Image1 runs'
    )

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'the cat in @图片1 runs' })
    )
  })

  it('submits the prompt with the uploaded reference URL and tells its page', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Aspect ratio: Auto' }))

    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent)
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
    expect(screen.queryByText('@Image1')).not.toBeInTheDocument()
  })

  it('lists every model from the pricing data and submits the picked one', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(
      screen.getByRole('button', { name: 'Model: seedance-2.0' })
    )
    expect(
      screen.getAllByRole('menuitemradio').map((item) => item.textContent)
    ).toEqual([
      'seedance-2.04–15s · up to 4K¥0.15/s',
      'seedance-2.54–30s · up to 1080P¥0.15/s',
      'seedance2.0-720p-P5–15s · up to 720P¥0.15/s',
    ])
    await user.click(
      screen.getByRole('menuitemradio', { name: /^seedance2.0-720p-P/ })
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
      'the dog in @Image1 dances to @Audio1'
    )
    expect(
      screen.getByRole('button', { name: 'Model: seedance-2.5' })
    ).toBeInTheDocument()
    // The badges; the prompt's highlighted mentions are left out.
    expect(screen.getByText('@Image1', { ignore: 'mark' })).toBeInTheDocument()
    expect(screen.getByText('@Audio1', { ignore: 'mark' })).toBeInTheDocument()
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
    const items = screen.getAllByRole('menuitemradio')
    expect(items[0]).toHaveTextContent(/^seedance-2\.5/)
    expect(items[1]).toHaveTextContent(/^seedance-2\.0/)
    expect(items[2]).toHaveTextContent(/^seedance2\.0-720p-P/)
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
      name: /^seedance-2.5-g4-m1-官转/,
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
  it('offers an in-place top-up instead of submitting when the wallet falls short', async () => {
    studioBalance.shortfallUSD = 0.5
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Insufficient balance')
    const button = screen.getByRole('button', { name: 'Top up and generate' })
    expect(button).toBeEnabled()
    await user.click(button)
    expect(
      screen.getByRole('dialog', { name: 'Quick top-up' })
    ).toHaveTextContent('0.5 studio')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('opens the same top-up from the fee breakdown', async () => {
    studioBalance.shortfallUSD = 0.5
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    await user.click(screen.getByRole('button', { name: 'Fee breakdown' }))
    await user.click(screen.getByRole('button', { name: 'Go to top up' }))
    expect(screen.getByRole('dialog', { name: 'Quick top-up' })).toBeVisible()
  })

  it('keeps the generate button enabled without a shortfall notice when the balance covers the cost', () => {
    render(<Composer onSubmitted={vi.fn()} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  })
})

describe('Composer prompt length guide', () => {
  it('describes the empty prompt with the Seedance advice and a 0 / 5,000 counter', () => {
    render(<Composer onSubmitted={vi.fn()} />)

    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    expect(prompt).toHaveAccessibleDescription(
      /^Seedance works best.*words\. 0 \/ 5,000 characters$/
    )
  })

  it('describes the 2000-character limit with the MiniMax hint when a MiniMax model is picked', () => {
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
    expect(prompt).toHaveAccessibleDescription(/MiniMax takes up to 2,000/)
  })

  it('keeps the Seedance advice and counts characters once the user starts typing', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })

    await user.type(prompt, 'a cat')

    expect(prompt).toHaveAccessibleDescription(
      /^Seedance works best.* 5 \/ 5,000 characters$/
    )
    expect(prompt).toHaveAttribute('aria-invalid', 'false')
  })

  it('keeps a pasted prompt over the limit whole, marks it invalid and does not submit it', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })

    await user.click(prompt)
    await user.paste('猫'.repeat(5001))
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    expect(prompt).toHaveValue('猫'.repeat(5001))
    expect(prompt).toHaveAttribute('aria-invalid', 'true')
    expect(prompt).toHaveAccessibleDescription(/5,001 \/ 5,000 characters$/)
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('Composer prompt card layout', () => {
  it('shows the placeholder and its example line in the empty prompt box, and hides them once typing starts', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    const placeholder = screen.getByTestId('prompt-placeholder')
    expect(placeholder).toHaveTextContent(
      /^Describe the video you want to createType @ to mention/
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat'
    )

    expect(screen.queryByTestId('prompt-placeholder')).toBeNull()
  })

  it('keeps the reference retention note in the card footer after typing', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat'
    )

    expect(screen.getByTestId('composer-card')).toHaveTextContent(
      /Reference files are kept for \d+ days/
    )
  })
})

function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByTestId('composer-card'), {
    dataTransfer: { types: ['Files'], files },
  })
}

const png = (name: string) => new File(['png!'], name, { type: 'image/png' })

describe('Composer draft', () => {
  it('brings the unsent prompt, files and settings back after leaving the page', async () => {
    const user = userEvent.setup()
    const view = render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    await user.click(screen.getByRole('button', { name: /^Resolution:/ }))
    await user.click(screen.getByRole('menuitemradio', { name: '1080P' }))
    view.unmount()

    render(<Composer onSubmitted={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Video prompt' })).toHaveValue(
      'a cat runs'
    )
    expect(screen.getByText('@Image1')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Resolution: 1080P' })
    ).toBeInTheDocument()
  })

  it('only changes the model of the draft when opened with one', async () => {
    const user = userEvent.setup()
    const view = render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    view.unmount()

    render(<Composer onSubmitted={vi.fn()} initialModel='seedance-2.5' />)

    expect(screen.getByRole('textbox', { name: 'Video prompt' })).toHaveValue(
      'a cat runs'
    )
    expect(
      screen.getByRole('button', { name: 'Model: seedance-2.5' })
    ).toBeInTheDocument()
  })

  it('empties the prompt and the files when Clear is clicked', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByRole('textbox', { name: 'Video prompt' })).toHaveValue(
      ''
    )
    expect(screen.queryByText('@Image1')).not.toBeInTheDocument()
  })
})

describe('Composer modes', () => {
  it('sends no files in text mode and keeps them for reference mode', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await uploadImage(user)
    await user.click(screen.getByRole('button', { name: 'Text to video' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('images')
    await user.click(
      screen.getByRole('button', { name: 'All-in-one reference' })
    )
    expect(screen.getByText('@Image1')).toBeInTheDocument()
  })

  it('uses an image dropped in image mode as the first frame', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Image to video' }))

    dropFiles([png('cat.png')])
    await screen.findByRole('button', { name: 'Remove cat.png' })
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        first_image_url: 'https://site.example/video-assets/cat.png',
      })
    )
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('last_image_url')
  })

  it('fills the first and then the last frame with two dropped images', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.click(
      screen.getByRole('button', { name: 'First and last frame' })
    )

    dropFiles([png('day.png'), png('night.png')])

    expect(
      await screen.findByRole('button', { name: 'Remove day.png' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove night.png' })
    ).toBeInTheDocument()
  })

  it('does not submit a first and last frame without the last one', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.click(
      screen.getByRole('button', { name: 'First and last frame' })
    )
    dropFiles([png('day.png')])
    await screen.findByRole('button', { name: 'Remove day.png' })
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'the sun sets'
    )

    const button = screen.getByRole('button', { name: 'Generate video' })
    expect(button).toHaveAttribute('title', 'Add a last frame image')
    await user.click(button)
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('Composer files', () => {
  it('turns a file dropped in text mode into a reference', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Text to video' }))

    dropFiles([png('cat.png')])

    expect(await screen.findByText('@Image1')).toBeInTheDocument()
  })

  it('uploads a pasted image, and leaves pasted text to the prompt', async () => {
    render(<Composer onSubmitted={vi.fn()} />)
    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })

    fireEvent.paste(prompt, {
      clipboardData: { files: [png('office.png')], getData: () => 'some text' },
    })
    expect(uploadMock).not.toHaveBeenCalled()
    fireEvent.paste(prompt, {
      clipboardData: { files: [png('cat.png')], getData: () => '' },
    })

    expect(await screen.findByText('@Image1')).toBeInTheDocument()
    expect(uploadMock).toHaveBeenCalledOnce()
  })

  it('spells out why an upload failed and uploads the file again on Retry', async () => {
    uploadMock.mockResolvedValueOnce({ success: false, message: 'Disk full' })
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.upload(screen.getByLabelText('References'), png('cat.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('@Image1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(uploadMock).toHaveBeenCalledTimes(2)
  })

  it('names a file that is too large and offers no retry', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    const big = png('big.png')
    Object.defineProperty(big, 'size', { value: 12 * 1024 * 1024 })

    await user.upload(screen.getByLabelText('References'), big)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /^big\.png is 12 MB/
    )
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument()
  })

  it('shows the use of each file limit and removes the extra files', async () => {
    studioModels.current = [
      {
        ...studioModels.current[0],
        referenceLimits: { image: 1, video: 0, audio: 0 },
      },
    ]
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    dropFiles([png('cat.png'), png('dog.png')])
    expect(await screen.findByText('Image 2/1')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Remove the extra files' })
    )

    expect(screen.getByText('Image 1/1')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove cat.png' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove dog.png' })
    ).not.toBeInTheDocument()
  })
})

describe('Composer submission', () => {
  it('shows a card for every video before the first task is created', async () => {
    let create = (_: string) => {}
    createMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          create = resolve
        })
    )
    const onSubmitted = vi.fn()
    const user = userEvent.setup()
    render(<Composer onSubmitted={onSubmitted} />)
    await user.click(screen.getByRole('button', { name: /^Number of videos/ }))
    await user.click(screen.getByRole('menuitemradio', { name: /^2/ }))
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    expect(useStudioPending.getState().videos).toHaveLength(2)
    expect(onSubmitted).toHaveBeenCalledOnce()
    create('task_1')
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2))
  })

  it('removes the cards of the videos that could not be created', async () => {
    createMock.mockRejectedValueOnce(new Error('busy'))
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    await waitFor(() =>
      expect(useStudioPending.getState().videos).toHaveLength(0)
    )
  })
})

describe('Composer recent drafts and model choice', () => {
  it('says the draft came back from an earlier visit until it is changed', async () => {
    const user = userEvent.setup()
    const view = render(<Composer onSubmitted={vi.fn()} />)
    await user.type(
      screen.getByRole('textbox', { name: 'Video prompt' }),
      'a cat runs'
    )
    view.unmount()

    render(<Composer onSubmitted={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Restored your draft from/
    )
    await user.type(screen.getByRole('textbox', { name: 'Video prompt' }), '!')

    expect(screen.queryByText(/^Restored your draft from/)).toBeNull()
    expect(screen.getByText('Draft saved')).toBeInTheDocument()
  })

  it('brings back a cleared draft from Recent drafts', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    const prompt = screen.getByRole('textbox', { name: 'Video prompt' })
    await user.type(prompt, 'a cat runs')
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    await user.click(screen.getByRole('button', { name: 'Recent drafts' }))
    await user.click(screen.getByRole('menuitem', { name: /a cat runs/ }))

    expect(prompt).toHaveValue('a cat runs')
  })

  it('spells out the fee as the price of a second times the length and count', async () => {
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Fee breakdown' }))
    expect(screen.getByText('≈ ¥0.15/s × 5s × 1')).toBeInTheDocument()
  })

  it('prices a model billed per video by the video, whatever its length', async () => {
    studioPrice.perVideo = true
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Fee breakdown' }))
    expect(screen.getByText('≈ ¥0.15/video × 1')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(
      screen.getByRole('button', { name: 'Model: seedance-2.0' })
    )
    expect(
      screen.getByRole('menuitemradio', { name: /^seedance-2.0/ })
    ).toHaveTextContent('¥0.15/video')
  })

  it('offers a model that takes all the files when the picked one does not', async () => {
    studioModels.current = [
      {
        ...studioModels.current[0],
        referenceLimits: { image: 1, video: 0, audio: 0 },
      },
      { ...studioModels.current[1], name: 'roomy-model' },
    ]
    const user = userEvent.setup()
    render(<Composer onSubmitted={vi.fn()} />)
    dropFiles([png('cat.png'), png('dog.png')])
    await screen.findByText('Image 2/1')

    await user.click(
      screen.getByRole('button', { name: 'Switch to roomy-model' })
    )

    expect(
      screen.getByRole('button', { name: 'Model: roomy-model' })
    ).toBeInTheDocument()
    expect(screen.getByText('Image 2/9')).toBeInTheDocument()
  })

  it('opens the model menu when asked to try another model', () => {
    render(<Composer onSubmitted={vi.fn()} pickModel />)

    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
  })
})
