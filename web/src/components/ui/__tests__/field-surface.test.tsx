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
import { describe, expect, it } from 'vitest'

import { Input } from '../input'
import { InputGroup, InputGroupInput } from '../input-group'
import { NativeSelect } from '../native-select'
import { Textarea } from '../textarea'

// Pages sit on the translucent site backdrop, so a transparent field would
// show only its faint border there; every text control paints its own fill.
describe('text control surfaces', () => {
  it('gives inputs and textareas an opaque background in light mode', () => {
    render(
      <>
        <Input aria-label='name' />
        <Textarea aria-label='notes' />
      </>
    )

    for (const control of [
      screen.getByRole('textbox', { name: 'name' }),
      screen.getByRole('textbox', { name: 'notes' }),
    ]) {
      expect(control).toHaveClass('bg-background')
      expect(control).not.toHaveClass('bg-transparent')
    }
  })

  it('gives native selects an opaque background in light mode', () => {
    render(
      <NativeSelect aria-label='size'>
        <option>S</option>
      </NativeSelect>
    )

    expect(screen.getByRole('combobox', { name: 'size' })).toHaveClass(
      'bg-background'
    )
  })

  it('paints the input group frame instead of its inner input', () => {
    render(
      <InputGroup>
        <InputGroupInput aria-label='search' />
      </InputGroup>
    )

    expect(screen.getByRole('group')).toHaveClass('bg-background')
    expect(screen.getByRole('textbox', { name: 'search' })).toHaveClass(
      'bg-transparent'
    )
  })
})
