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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpsSectionNav } from '../ops-section-nav'

const items = [
  { id: 'nav-a', index: 1, label: 'Alpha' },
  { id: 'nav-b', index: 2, label: 'Beta' },
  { id: 'nav-c', index: 3, label: 'Gamma' },
]

function rect(top: number, bottom: number) {
  return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }
}

/** Places the sections at fixed tops and returns the scrolling element. */
function renderPage(tops: number[], heights = 400) {
  render(
    <div data-testid='scroller'>
      <OpsSectionNav items={items} />
      {items.map((item) => (
        <section key={item.id} id={item.id} />
      ))}
    </div>
  )
  const nav = screen.getByRole('navigation')
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(0, 50))
  items.forEach((item, index) => {
    const section = document.getElementById(item.id) as HTMLElement
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(
      rect(tops[index], tops[index] + heights)
    )
  })
  return screen.getByTestId('scroller')
}

function current() {
  return screen
    .getAllByRole('link')
    .find((link) => link.getAttribute('aria-current') === 'location')
    ?.textContent
}

describe('OpsSectionNav', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('marks the last section whose top has scrolled under the bar', async () => {
    const scroller = renderPage([-900, 60, 1200])

    fireEvent.scroll(scroller)

    await waitFor(() => expect(current()).toBe('2Beta'))
  })

  it('marks the last section once the page has scrolled to its end', async () => {
    // Gamma is too short to reach the bar but its bottom is on screen.
    const scroller = renderPage([-900, -300, 400], 300)

    fireEvent.scroll(scroller)

    await waitFor(() => expect(current()).toBe('3Gamma'))
  })

  it('marks a section as soon as its link is clicked', () => {
    renderPage([0, 1200, 2400])

    fireEvent.click(screen.getByRole('link', { name: /Gamma/ }))

    expect(current()).toBe('3Gamma')
  })
})
