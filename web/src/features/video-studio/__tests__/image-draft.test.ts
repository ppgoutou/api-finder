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

import type { PricingModel } from '@/features/pricing/types'

import {
  buildImageRequest,
  estimateImageCostUSD,
  studioImageModelsFromPricing,
  validateImageDraft,
  type ImageDraft,
} from '../lib/image-draft'

function imageModel(name: string, expr?: string): PricingModel {
  return {
    id: 1,
    model_name: name,
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 0,
    enable_groups: ['default'],
    supported_endpoint_types: ['openai', 'image-generation', 'image-edit'],
    ...(expr ? { billing_mode: 'tiered_expr', billing_expr: expr } : {}),
  }
}

const SIZE_TIERED =
  '(c * 256 / image_count <= 2360000 ? tier("small", fixed(0.0648)) : tier("large", fixed(0.1296))) * image_count'

function draft(patch: Partial<ImageDraft> = {}): ImageDraft {
  return {
    model: 'seedream-5.0',
    prompt: 'a cat',
    size: '2048x2048',
    count: 1,
    references: [],
    ...patch,
  }
}

describe('studioImageModelsFromPricing', () => {
  it('keeps only models that serve image generation', () => {
    expect(
      studioImageModelsFromPricing([
        imageModel('seedream-5.0'),
        { ...imageModel('seedance-2.0'), supported_endpoint_types: ['openai'] },
      ])
    ).toEqual([{ name: 'seedream-5.0', label: 'seedream-5.0' }])
  })
})

describe('estimateImageCostUSD', () => {
  it('multiplies a fixed per-image price by the image count', () => {
    const model = imageModel(
      'flash',
      'tier("image", fixed(0.028)) * image_count'
    )
    expect(estimateImageCostUSD(model, '2048x2048', 3)).toBeCloseTo(0.084)
  })

  it.each([
    ['1024x1024', 2, 0.0648 * 2],
    ['2048x2048', 2, 0.1296 * 2],
  ])(
    'picks the size tier from the pixels of each %s image',
    (size, count, expected) => {
      const model = imageModel('pro', SIZE_TIERED)
      expect(estimateImageCostUSD(model, size, count)).toBeCloseTo(expected)
    }
  )

  it('returns null for a model without a billing expression', () => {
    expect(estimateImageCostUSD(imageModel('plain'), '2048x2048', 1)).toBeNull()
  })
})

describe('image drafts', () => {
  it('sends the uploaded reference images with the size and count', () => {
    const body = buildImageRequest(
      draft({
        prompt: '  a cat  ',
        count: 2,
        references: [
          {
            id: 'a',
            kind: 'image',
            fileName: 'cat.png',
            previewUrl: 'blob:a',
            status: 'ready',
            progress: 100,
            url: 'https://site.example/video-assets/cat.png',
          },
        ],
      })
    )
    expect(body).toEqual({
      model: 'seedream-5.0',
      prompt: 'a cat',
      size: '2048x2048',
      n: 2,
      response_format: 'url',
      image: ['https://site.example/video-assets/cat.png'],
    })
  })

  it('leaves out the image field without references', () => {
    expect(buildImageRequest(draft())).not.toHaveProperty('image')
  })

  it('rejects an empty prompt', () => {
    expect(validateImageDraft(draft({ prompt: '  ' }))).toBe(
      'Describe the image you want'
    )
  })
})
