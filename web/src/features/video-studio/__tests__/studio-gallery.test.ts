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
  parseStudioGallery,
  serializeStudioGallery,
} from '../lib/studio-gallery'

describe('studio gallery settings', () => {
  it('round-trips configured clips without home-page hero slots', () => {
    const raw = serializeStudioGallery({
      items: [
        {
          title: 'Watch',
          category: 'Product',
          prompt: 'a watch on black',
          titleZh: '手表',
          categoryZh: '产品',
          promptZh: '黑色背景上的手表',
          spec: 'seedance-2.0 · 720p · 5s',
          video: 'https://cdn.example/watch.mp4',
          poster: 'https://cdn.example/watch.jpg',
          image: '',
        },
      ],
    })
    expect(JSON.parse(raw)).toEqual({
      items: [
        {
          title: 'Watch',
          category: 'Product',
          prompt: 'a watch on black',
          title_zh: '手表',
          category_zh: '产品',
          prompt_zh: '黑色背景上的手表',
          spec: 'seedance-2.0 · 720p · 5s',
          video: 'https://cdn.example/watch.mp4',
          poster: 'https://cdn.example/watch.jpg',
          image: '',
        },
      ],
    })
    expect(parseStudioGallery(raw).items[0]).toMatchObject({
      title: 'Watch',
      titleZh: '手表',
      video: 'https://cdn.example/watch.mp4',
    })
  })

  it('serializes an empty gallery as a blank option', () => {
    expect(serializeStudioGallery({ items: [] })).toBe('')
    expect(parseStudioGallery('').items).toEqual([])
  })
})
