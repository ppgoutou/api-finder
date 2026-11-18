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
import { describe, expect, it } from 'vitest'

import { cn } from '../utils'

describe('cn with the theme type scale and radius names', () => {
  it('keeps a named text size next to a text colour', () => {
    expect(cn('text-body', 'text-muted-foreground')).toBe(
      'text-body text-muted-foreground'
    )
  })

  it('lets a later named text size replace an earlier one', () => {
    expect(cn('text-sm text-body', 'text-caption')).toBe('text-caption')
  })

  it('lets a named radius replace a built-in radius', () => {
    expect(cn('rounded-lg', 'rounded-control')).toBe('rounded-control')
  })

  it('keeps the display font family next to a font weight', () => {
    expect(cn('font-display', 'font-bold')).toBe('font-display font-bold')
  })
})
