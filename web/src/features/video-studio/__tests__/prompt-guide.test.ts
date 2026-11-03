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

import { promptGuide } from '../lib/prompt-guide'

describe('promptGuide', () => {
  it.each([
    ['C-seedance-2.0', 5000, /^Seedance/],
    ['sd-2.0-线路1', 5000, /^Seedance/],
    ['D-sd2.5-G3-1', 5000, /^Seedance/],
    ['D-wan-3.0-P', 5000, /^Wan/],
    ['H-MiniMax-H3-Fast', 2000, /^MiniMax/],
    ['A-seedream-5.0-pro-P', 5000, /^Up to/],
    [undefined, 5000, /^Up to/],
  ])(
    'maps %s to a %i-character limit with its family hint',
    (name, max, hint) => {
      const guide = promptGuide(name)
      expect(guide.maxLength).toBe(max)
      expect(guide.hint).toMatch(hint)
    }
  )
})
