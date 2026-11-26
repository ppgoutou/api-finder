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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PromptInput } from '../components/prompt-input'
import { TypingPlaceholder } from '../components/typing-placeholder'

const realMatchMedia = window.matchMedia

function allowMotion() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      ...realMatchMedia(query),
      matches: false,
    }),
  })
}

/** Runs the next `steps` timers, letting React render between them. */
function runSteps(steps: number) {
  for (let i = 0; i < steps; i++) {
    act(() => {
      vi.advanceTimersToNextTimer()
    })
  }
}

describe('TypingPlaceholder with motion allowed', () => {
  beforeEach(() => {
    allowMotion()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: realMatchMedia,
    })
  })

  it('types the first line one character at a time', () => {
    render(<TypingPlaceholder lines={['abc', 'xy']} />)
    const typing = screen.getByTestId('prompt-typing')
    expect(typing).toHaveTextContent(/^$/)

    runSteps(1)
    expect(typing).toHaveTextContent(/^a$/)

    runSteps(2)
    expect(typing).toHaveTextContent(/^abc$/)
  })

  it('erases a finished line after holding it and types the next one', () => {
    render(<TypingPlaceholder lines={['abc', 'xy']} />)
    const typing = screen.getByTestId('prompt-typing')

    // Type 3, finish, hold, then erase 3.
    runSteps(3 + 1 + 1 + 3)
    expect(typing).toHaveTextContent(/^$/)

    // Move to the next line, then type 2.
    runSteps(1 + 2)
    expect(typing).toHaveTextContent(/^xy$/)
  })

  it('goes back to the first line after the last one', () => {
    render(<TypingPlaceholder lines={['a', 'b']} />)
    const typing = screen.getByTestId('prompt-typing')
    // Per line: type, finish, hold, erase, next line.
    runSteps(5 * 2 + 1)
    expect(typing).toHaveTextContent(/^a$/)
  })
})

describe('TypingPlaceholder with reduced motion', () => {
  it('shows the first line as plain text and never types', () => {
    vi.useFakeTimers()
    render(<TypingPlaceholder lines={['Describe the video', 'a cat']} />)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByTestId('prompt-typing')).toHaveTextContent(
      /^Describe the video$/
    )
    vi.useRealTimers()
  })
})

describe('PromptInput examples', () => {
  it('shows the plain placeholder instead of the typing examples while the empty box has focus', () => {
    render(
      <PromptInput
        value=''
        onChange={vi.fn()}
        mentions={[]}
        placeholder='Describe the video'
        examples={['a cat']}
        describedBy=''
        onSubmit={vi.fn()}
        guide={{ maxLength: 5000 }}
      />
    )
    expect(screen.getByTestId('prompt-typing')).toBeInTheDocument()

    fireEvent.focus(screen.getByRole('textbox', { name: 'Video prompt' }))

    expect(screen.queryByTestId('prompt-typing')).toBeNull()
    expect(screen.getByTestId('prompt-placeholder')).toHaveTextContent(
      /^Describe the video$/
    )
  })
})
