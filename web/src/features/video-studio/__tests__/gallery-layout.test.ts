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

import { groupByModel, specAspectRatio } from '../lib/gallery-layout'

describe('specAspectRatio', () => {
  it('reads the ratio named in a spec when it has one', () => {
    expect(specAspectRatio('Seedance 2.5 · 9:16 · 720p · 30s')).toBe(9 / 16)
  })

  it('gives undefined when a spec names no ratio', () => {
    expect(specAspectRatio('Seedance 2.5 · 720p')).toBeUndefined()
  })
})

describe('groupByModel', () => {
  it('keeps models in order of first appearance and works in their order', () => {
    const works = [
      { id: 1, spec: 'Seedance 2.5 · 16:9' },
      { id: 2, spec: 'Wan 3.0 · 16:9' },
      { id: 3, spec: 'Seedance 2.5 · 9:16' },
    ]

    expect(groupByModel(works)).toEqual([
      { model: 'Seedance 2.5', works: [works[0], works[2]] },
      { model: 'Wan 3.0', works: [works[1]] },
    ])
  })

  it('puts works without a model in a last group with an empty model', () => {
    const works = [
      { id: 1, spec: '' },
      { id: 2, spec: 'Wan 3.0 · 16:9' },
    ]

    expect(groupByModel(works)).toEqual([
      { model: 'Wan 3.0', works: [works[1]] },
      { model: '', works: [works[0]] },
    ])
  })

  it('gives no groups when there are no works', () => {
    expect(groupByModel([])).toEqual([])
  })
})
