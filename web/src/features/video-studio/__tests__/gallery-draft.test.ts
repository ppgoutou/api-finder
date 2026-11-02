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

import {
  draftFromGalleryItem,
  parseGallerySpec,
} from '../lib/gallery-draft'

describe('parseGallerySpec', () => {
  it('reads model, resolution and seconds from a showcase-style line', () => {
    expect(parseGallerySpec('seedance-2.0 · 1080p · 10s')).toEqual({
      model: 'seedance-2.0',
      resolution: '1080p',
      seconds: 10,
    })
  })

  it('accepts Chinese duration units and an aspect ratio segment', () => {
    expect(parseGallerySpec('H-MiniMax-H3-Fast · 16:9 · 768p · 15 秒')).toEqual(
      {
        model: 'H-MiniMax-H3-Fast',
        ratio: '16:9',
        resolution: '768p',
        seconds: 15,
      }
    )
  })

  it('returns an empty object for a blank spec', () => {
    expect(parseGallerySpec('')).toEqual({})
  })
})

describe('draftFromGalleryItem', () => {
  it('fills prompt and parsed generation parameters for reuse', () => {
    expect(
      draftFromGalleryItem({
        prompt: 'a silver supercar on a rainy track',
        spec: 'seedance-2.0 · 720p · 5s',
      })
    ).toMatchObject({
      mode: 'reference',
      prompt: 'a silver supercar on a rainy track',
      model: 'seedance-2.0',
      resolution: '720p',
      seconds: 5,
      count: 1,
      references: [],
    })
  })

  it('restores a reference image as the first frame when provided', () => {
    const draft = draftFromGalleryItem({
      prompt: 'animate this still',
      spec: 'seedance-2.0 · 720p · 5s',
      image: 'https://site.example/home-media/still.png',
    })
    expect(draft.mode).toBe('frames')
    expect(draft.firstFrame).toMatchObject({
      kind: 'image',
      status: 'ready',
      url: 'https://site.example/home-media/still.png',
    })
    expect(draft.references).toEqual([])
  })
})
