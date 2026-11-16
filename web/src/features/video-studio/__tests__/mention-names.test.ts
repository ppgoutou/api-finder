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

import { canonicalMentions, localizeMentions } from '../lib/mention-names'

describe('localizeMentions', () => {
  it.each([
    [
      'en',
      'use @视频1 with @图片2 and @音频1',
      'use @Video1 with @Image2 and @Audio1',
    ],
    ['zhTW', 'use @视频1 with @图片2', 'use @影片1 with @圖片2'],
    ['ja', 'use @视频1 with @图片2', 'use @動画1 with @画像2'],
    ['zhCN', 'use @视频1 with @图片2', 'use @视频1 with @图片2'],
  ])(
    'shows mentions in %s with that language names',
    (language, prompt, shown) => {
      expect(localizeMentions(prompt, language)).toBe(shown)
    }
  )

  it('falls back to English names for an unknown language', () => {
    expect(localizeMentions('@图片1', 'de')).toBe('@Image1')
  })

  it('keeps multi-digit numbers on the same reference', () => {
    expect(localizeMentions('@图片12', 'en')).toBe('@Image12')
  })
})

describe('canonicalMentions', () => {
  it('turns typed localized mentions back into the model tokens', () => {
    expect(canonicalMentions('the @Image1 moves like @Video2', 'en')).toBe(
      'the @图片1 moves like @视频2'
    )
  })

  it('leaves words without @ or a number untouched', () => {
    expect(canonicalMentions('Image of a Video @Image here', 'en')).toBe(
      'Image of a Video @Image here'
    )
  })

  it('leaves model tokens typed in another language as they are', () => {
    expect(canonicalMentions('@图片1 and @画像1', 'en')).toBe(
      '@图片1 and @画像1'
    )
  })
})
