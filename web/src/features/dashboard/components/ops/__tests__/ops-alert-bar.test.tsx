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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpsAlertBar, type OpsAlertItem } from '../ops-alert-bar'

const overdue: OpsAlertItem = {
  key: 'overdue',
  n: 2,
  label: 'overdue orders',
  href: '#ops-orders',
}

function closeButton() {
  return screen.getByRole('button', { name: 'Close' })
}

describe('OpsAlertBar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows nothing when no alert needs handling', () => {
    render(<OpsAlertBar alerts={[]} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('hides the bar when closed and keeps it hidden after reopening the page', async () => {
    const first = render(<OpsAlertBar alerts={[overdue]} />)
    await userEvent.click(closeButton())
    expect(screen.queryByRole('link')).toBeNull()

    first.unmount()
    render(<OpsAlertBar alerts={[overdue]} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('brings the bar back when a closed figure changes', async () => {
    const view = render(<OpsAlertBar alerts={[overdue]} />)
    await userEvent.click(closeButton())

    view.rerender(<OpsAlertBar alerts={[{ ...overdue, n: 3 }]} />)
    expect(screen.getByRole('link').textContent).toContain('3')
  })

  it('still closes when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<OpsAlertBar alerts={[overdue]} />)
    await userEvent.click(closeButton())
    expect(screen.queryByRole('link')).toBeNull()
  })
})
