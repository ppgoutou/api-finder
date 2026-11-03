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
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ComboboxInput } from '../combobox-input'

const options = [
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  { value: 'claude-x', label: 'claude-x' },
]

function rect(top: number, left: number, width: number, height: number) {
  return DOMRect.fromRect({ x: left, y: top, width, height })
}

function renderInFrame(frame: { transform?: string; height: number }) {
  render(
    <div role='dialog' style={{ transform: frame.transform }}>
      <ComboboxInput
        options={options}
        value=''
        onValueChange={() => {}}
        allowCustomValue
        aria-label='Model'
      />
    </div>
  )
  const dialog = screen.getByRole('dialog')
  const input = screen.getByRole('combobox', { name: 'Model' })
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(
    rect(100, 200, 600, frame.height)
  )
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
    rect(150, 230, 400, 32)
  )
  return input
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('combobox input list position', () => {
  it('measures from a translated dialog and opens below when it fits', async () => {
    const input = renderInFrame({
      transform: 'translate(-50%, -50%)',
      height: 500,
    })

    await userEvent.click(input)

    const popup = screen.getByRole('listbox').parentElement!
    expect(popup.style.top).toBe('86px')
    expect(popup.style.left).toBe('30px')
    expect(popup.style.transform).toBe('')
  })

  it('opens upward inside a translated dialog with no room below', async () => {
    const input = renderInFrame({
      transform: 'translate(-50%, -50%)',
      height: 120,
    })

    await userEvent.click(input)

    const popup = screen.getByRole('listbox').parentElement!
    expect(popup.style.top).toBe('46px')
    expect(popup.style.transform).toBe('translateY(-100%)')
  })

  it('keeps viewport coordinates when the dialog is not transformed', async () => {
    const input = renderInFrame({ height: 500 })

    await userEvent.click(input)

    const popup = screen.getByRole('listbox').parentElement!
    expect(popup.style.top).toBe('186px')
    expect(popup.style.left).toBe('230px')
  })
})
