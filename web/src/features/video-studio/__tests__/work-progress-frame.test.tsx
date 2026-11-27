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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkProgress } from '../components/work-progress'

const NOW = 1_800_000_000

describe('WorkProgress frame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW * 1000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports the developed share when the typical time is known', () => {
    render(
      <WorkProgress stage='generating' startedAt={NOW - 60} typical={240} />
    )

    const bar = screen.getByRole('progressbar', { name: 'Generating' })
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(bar.parentElement).toHaveAttribute('data-mode', 'known')
  })

  it('never reports the frame as fully developed while unfinished', () => {
    render(<WorkProgress stage='queued' startedAt={NOW - 400} typical={240} />)

    const bar = screen.getByRole('progressbar', { name: 'Queued' })
    expect(bar).toHaveAttribute('aria-valuenow', '95')
    expect(bar.parentElement).toHaveAttribute('data-slow', 'true')
    expect(screen.getByRole('link', { name: 'Contact support' })).toBeVisible()
  })

  it('sweeps without a value while generating with no typical time', () => {
    render(<WorkProgress stage='generating' startedAt={NOW} typical={null} />)

    const bar = screen.getByRole('progressbar', { name: 'Generating' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar.parentElement).toHaveAttribute('data-mode', 'sweeping')
  })

  it('only waits without a value while queued with no typical time', () => {
    render(<WorkProgress stage='submitting' startedAt={NOW} typical={null} />)

    const bar = screen.getByRole('progressbar', { name: 'Submitting' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar.parentElement).toHaveAttribute('data-mode', 'waiting')
  })

  it('drops the hint in a compact card', () => {
    render(
      <WorkProgress stage='generating' startedAt={NOW} typical={null} compact />
    )

    expect(screen.queryByText('You can leave this page.')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Generating')
  })
})
