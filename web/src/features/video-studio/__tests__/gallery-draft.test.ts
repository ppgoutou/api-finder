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

import type { StudioModel } from '../constants'
import {
  draftFromGalleryItem,
  formatGallerySpec,
  galleryModelFor,
  gallerySeries,
  parseGallerySpec,
} from '../lib/gallery-draft'

const SITE = 'https://api.example.com'
const STUDIO = { serverAddress: SITE, models: [] }

const MODELS: StudioModel[] = [
  {
    name: 'E-seedance-2.0',
    group: 'Seedance 2.0',
    resolutions: ['480p', '720p'],
    duration: [4, 15],
    ratios: ['auto', '16:9', '9:16'],
  },
  {
    name: 'G-seedance-2.0',
    group: 'Seedance 2.0',
    resolutions: ['720p', '1080p'],
    duration: [4, 15],
    ratios: ['auto', '16:9', '21:9'],
  },
  {
    name: 'E-seedance-2.0-mini',
    group: 'Seedance 2.0 Mini',
    resolutions: ['720p'],
    duration: [4, 15],
    ratios: ['auto', '16:9'],
  },
  {
    name: 'D-wan-3.0-P',
    group: 'Wan 3.0',
    resolutions: ['720p', '1080p'],
    duration: [5, 30],
    durations: [5, 10, 30],
    ratios: ['auto', '16:9', '9:16', '1:1'],
  },
]

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
      draftFromGalleryItem(
        {
          prompt: 'a silver supercar on a rainy track',
          spec: 'seedance-2.0 · 720p · 5s',
        },
        STUDIO
      )
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
    const draft = draftFromGalleryItem(
      {
        prompt: 'animate this still',
        spec: 'seedance-2.0 · 720p · 5s',
        image: 'https://site.example/home-media/still.png',
      },
      STUDIO
    )
    expect(draft.mode).toBe('frames')
    expect(draft.firstFrame).toMatchObject({
      kind: 'image',
      status: 'ready',
      url: 'https://site.example/home-media/still.png',
    })
    expect(draft.references).toEqual([])
  })

  it('puts the site address in front of an uploaded reference image so upstream can fetch it', () => {
    const draft = draftFromGalleryItem(
      {
        prompt: 'animate this still',
        image: '/home-media/0123456789abcdef0123456789abcdef.png',
      },
      { serverAddress: `${SITE}/`, models: [] }
    )
    expect(draft.firstFrame?.url).toBe(
      'https://api.example.com/home-media/0123456789abcdef0123456789abcdef.png'
    )
  })
})

describe('formatGallerySpec', () => {
  it('writes picked parameters as a spec line that parses back unchanged', () => {
    const spec = {
      model: 'seedance-2.0',
      ratio: '16:9' as const,
      resolution: '720p',
      seconds: 5,
    }
    const line = formatGallerySpec(spec)
    expect(line).toBe('seedance-2.0 · 16:9 · 720p · 5s')
    expect(parseGallerySpec(line)).toEqual(spec)
  })
})

describe('gallerySeries', () => {
  it('lists only the gallery series the studio offers, each taking what any of its models takes', () => {
    expect(gallerySeries(MODELS)).toEqual([
      {
        name: 'Seedance 2.0',
        group: 'Seedance 2.0',
        resolutions: ['480p', '720p', '1080p'],
        duration: [4, 15],
        ratios: ['auto', '21:9', '16:9', '9:16'],
      },
      {
        name: 'Wan 3.0',
        group: 'Wan 3.0',
        resolutions: ['720p', '1080p'],
        duration: [5, 30],
        durations: [5, 10, 30],
        ratios: ['auto', '16:9', '1:1', '9:16'],
      },
    ])
  })
})

describe('galleryModelFor', () => {
  it('picks the model of the series that takes the chosen resolution and ratio', () => {
    expect(
      galleryModelFor(MODELS, {
        model: 'Seedance 2.0',
        ratio: '21:9',
        resolution: '1080p',
        seconds: 5,
      })
    ).toBe('G-seedance-2.0')
  })

  it('skips a temporarily unavailable model of the series', () => {
    const models = MODELS.map((model) =>
      model.name === 'E-seedance-2.0' ? { ...model, unavailable: true } : model
    )
    expect(
      galleryModelFor(models, { model: 'Seedance 2.0', resolution: '720p' })
    ).toBe('G-seedance-2.0')
  })

  it('keeps a spec that names one exact model', () => {
    expect(galleryModelFor(MODELS, { model: 'E-seedance-2.0-mini' })).toBe(
      'E-seedance-2.0-mini'
    )
  })

  it('finds nothing for a series the studio no longer offers', () => {
    expect(galleryModelFor(MODELS, { model: 'MiniMax-H3' })).toBeUndefined()
  })

  it('reuses a series work on its fitting studio model', () => {
    expect(
      draftFromGalleryItem(
        { prompt: 'a lake', spec: 'Seedance 2.0 · 21:9 · 1080p · 5s' },
        { serverAddress: SITE, models: MODELS }
      )
    ).toMatchObject({
      model: 'G-seedance-2.0',
      ratio: '21:9',
      resolution: '1080p',
      seconds: 5,
    })
  })
})
