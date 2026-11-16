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

import { promptGuide, promptLength } from '../lib/prompt-guide'

describe('promptGuide', () => {
  it.each([
    ['C-seedance-2.0', 7500, /^Seedance/],
    ['sd-2.0-线路1', 7500, /^Seedance/],
    ['D-sd2.5-G3-1', 7500, /^Seedance/],
    ['D-wan-3.0-P', 7500, /^Wan/],
    ['H-MiniMax-H3-Fast', 2000, /^MiniMax/],
    ['A-seedream-5.0-pro-P', 7500, /^Up to/],
    [undefined, 7500, /^Up to/],
  ])(
    'maps %s to a %i-character limit with its family hint',
    (name, max, hint) => {
      const guide = promptGuide(name)
      expect(guide.maxLength).toBe(max)
      expect(guide.hint).toMatch(hint)
    }
  )

  it('takes the limit a plugin declares only when it is lower', () => {
    expect(promptGuide('seedance2.5-T', 5000).maxLength).toBe(5000)
    expect(promptGuide('seedance2.5-T', 5000).hint).toMatch(/^Seedance/)
    expect(promptGuide('H-MiniMax-H3-Fast', 5000).maxLength).toBe(2000)
    expect(promptGuide('seedance2.5-T', undefined).maxLength).toBe(7500)
  })

  it('counts the trimmed prompt in Unicode characters', () => {
    expect(promptLength('  @图片1 跑步 😀 \n')).toBe(9)
  })
})
