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

function validate(item: { title?: string; prompt?: string }) {
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

  it('accepts a prompt of any length', () => {
    expect(validate({ prompt: 'p'.repeat(20000) }).success).toBe(true)
  })
})
