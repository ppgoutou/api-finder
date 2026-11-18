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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { generateImages } from '../api'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }))

const body = {
  model: 'seedream-5.0-pro',
  prompt: 'a red fox',
  size: '1024x1024',
  n: 2,
  response_format: 'url' as const,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('generateImages', () => {
  it('keeps the expiry of images the server stored and none for the others', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: [
          {
            url: 'https://media.example/images/a.png',
            media_expires_at: 1_900_000_000,
          },
          { b64_json: 'AAAA' },
        ],
      },
    })

    await expect(generateImages(body)).resolves.toEqual([
      { url: 'https://media.example/images/a.png', expiresAt: 1_900_000_000 },
      { url: 'data:image/png;base64,AAAA' },
    ])
  })

  it('fails when the response holds no image', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: [] } })

    await expect(generateImages(body)).rejects.toThrow(
      'Image generation failed'
    )
  })
})
