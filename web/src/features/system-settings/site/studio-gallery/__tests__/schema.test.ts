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

import { emptyStudioGalleryItem } from '@/features/video-studio/lib/studio-gallery'

import { studioGalleryFormSchema } from '../schema'

function validate(item: { title?: string; prompt?: string; spec?: string }) {
  return studioGalleryFormSchema.safeParse({
    items: [{ ...emptyStudioGalleryItem(), ...item }],
  })
}

describe('studio gallery form limits', () => {
  it('accepts a title of 100 characters', () => {
    expect(validate({ title: '标'.repeat(100) }).success).toBe(true)
  })

  it('rejects a title over 100 characters', () => {
    expect(validate({ title: '标'.repeat(101) }).success).toBe(false)
  })

  it('accepts a prompt as long as the studio takes, 7500 characters', () => {
    expect(validate({ prompt: '词'.repeat(7500) }).success).toBe(true)
  })

  it('rejects a prompt longer than the studio takes', () => {
    const result = validate({ prompt: 'p'.repeat(7501) })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['items', 0, 'prompt'],
      message: 'At most 7500 characters',
    })
  })

  it('holds a MiniMax work to the 2000 characters MiniMax takes', () => {
    const result = validate({
      prompt: 'p'.repeat(2001),
      spec: 'MiniMax-H3 · 16:9 · 768p · 6s',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('At most 2000 characters')
  })
})
