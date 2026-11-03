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

import { masonryColumns, specAspectRatio } from '../lib/gallery-masonry'

const LANDSCAPE = 16 / 9
const PORTRAIT = 9 / 16

describe('masonryColumns', () => {
  it('fills the first row left to right in reading order', () => {
    expect(
      masonryColumns([LANDSCAPE, LANDSCAPE, LANDSCAPE, LANDSCAPE], 4)
    ).toEqual([[0], [1], [2], [3]])
  })

  it('places the next work under the shortest column when a portrait work makes one column tall', () => {
    expect(
      masonryColumns([PORTRAIT, LANDSCAPE, LANDSCAPE, LANDSCAPE], 2)
    ).toEqual([[0], [1, 2, 3]])
  })

  it('keeps every work in a single column when one column is asked for', () => {
    expect(masonryColumns([LANDSCAPE, PORTRAIT], 1)).toEqual([[0, 1]])
  })

  it('returns empty columns for an empty gallery', () => {
    expect(masonryColumns([], 3)).toEqual([[], [], []])
  })
})

describe('specAspectRatio', () => {
  it('reads the width over height of the ratio a spec names', () => {
    expect(specAspectRatio('seedance-2.0 · 9:16 · 720p · 5s')).toBe(PORTRAIT)
  })

  it('returns undefined when the spec names no ratio', () => {
    expect(specAspectRatio('seedance-2.0 · 720p · 5s')).toBeUndefined()
  })
})
