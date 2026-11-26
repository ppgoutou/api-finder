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

import { GenerationScan } from '../components/generation-scan'
import { TYPED_PROMPT_SPEED, TypedPrompt } from '../components/typed-prompt'

const PROMPT = 'A neon street at night, rain on the lens'

let showInView: () => void = () => undefined
let frames: FrameRequestCallback[] = []

function stubMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private callback: IntersectionObserverCallback
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
        showInView = () =>
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          )
      }
      observe() {}
      disconnect() {}
    }
  )
}

/** Runs the pending animation frames as if `ms` had passed since typing began. */
function runFramesAt(ms: number) {
  const pending = frames
  frames = []
  act(() => {
    for (const frame of pending) frame(ms)
  })
}

function visibleText(): string {
  const visible = document.querySelector('p > [aria-hidden]')
  const hidden = visible?.querySelector('.invisible')?.textContent ?? ''
  return (visible?.textContent ?? '').slice(
    0,
    (visible?.textContent ?? '').length - hidden.length
  )
}

beforeEach(() => {
  frames = []
  vi.spyOn(performance, 'now').mockReturnValue(0)
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.push(frame)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TypedPrompt', () => {
  it('shows the whole prompt at once when the visitor asks for reduced motion', () => {
    stubMotion(true)
    render(<TypedPrompt text={PROMPT} />)

    expect(visibleText()).toBe(PROMPT)
    expect(document.querySelector('.cinema-caret')).toBeNull()
  })

  it('keeps the prompt for screen readers and types it out once it scrolls into view', () => {
    stubMotion(false)
    render(<TypedPrompt text={PROMPT} />)

    expect(document.querySelector('.sr-only')).toHaveTextContent(PROMPT)
    expect(visibleText()).toBe('')

    act(() => showInView())
    runFramesAt((10 / TYPED_PROMPT_SPEED) * 1000)
    expect(visibleText()).toBe(PROMPT.slice(0, 10))

    runFramesAt((PROMPT.length / TYPED_PROMPT_SPEED) * 1000)
    expect(visibleText()).toBe(PROMPT)
    expect(document.querySelector('.cinema-caret')).toBeNull()
  })
})

describe('GenerationScan', () => {
  it('renders nothing when the visitor asks for reduced motion', () => {
    stubMotion(true)
    render(<GenerationScan />)

    expect(screen.queryByTestId('generation-scan')).toBeNull()
  })

  it('starts scanning once in view and removes itself when the sweep ends', () => {
    stubMotion(false)
    render(<GenerationScan />)
    const scan = screen.getByTestId('generation-scan')
    expect(scan).toHaveAttribute('data-state', 'waiting')
    expect(scan).toHaveAttribute('aria-hidden', 'true')

    act(() => showInView())
    expect(scan).toHaveAttribute('data-state', 'scanning')

    fireEvent.animationEnd(scan)
    expect(screen.queryByTestId('generation-scan')).toBeNull()
  })
})
