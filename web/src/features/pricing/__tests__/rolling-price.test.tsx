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
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RollingPrice } from '../components/rolling-price'

let frames: FrameRequestCallback[] = []
const originalMatchMedia = window.matchMedia

function runFrame(time: number) {
  const pending = frames
  frames = []
  act(() => pending.forEach((callback) => callback(time)))
}

beforeEach(() => {
  frames = []
  vi.spyOn(performance, 'now').mockReturnValue(0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({ ...originalMatchMedia(query), matches: false }) as MediaQueryList
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('rolling price', () => {
  it('counts down through intermediate prices to a lower price', () => {
    const { container, rerender } = render(<RollingPrice value='¥0.37' />)

    rerender(<RollingPrice value='¥0.342' />)
    runFrame(100)

    const frame = container.querySelector('[aria-hidden="true"]')
    const shown = Number(frame?.textContent?.replace('¥', ''))
    expect(shown).toBeLessThan(0.37)
    expect(shown).toBeGreaterThan(0.342)
    expect(frame?.textContent).toMatch(/^¥0\.\d{3}$/)
    expect(screen.getByText('¥0.342')).toHaveClass('sr-only')
  })

  it('ends on the exact new price text once the roll finishes', () => {
    const { container, rerender } = render(<RollingPrice value='¥0.342' />)

    rerender(<RollingPrice value='¥0.37' />)
    runFrame(100)
    runFrame(1000)

    expect(container).toHaveTextContent(/^¥0\.37$/)
  })

  it('shows the new price at once for viewers who prefer reduced motion', () => {
    vi.mocked(window.matchMedia).mockImplementation(originalMatchMedia)
    const { container, rerender } = render(<RollingPrice value='¥0.37' />)

    rerender(<RollingPrice value='¥0.342' />)

    expect(frames).toHaveLength(0)
    expect(container).toHaveTextContent(/^¥0\.342$/)
  })
})
