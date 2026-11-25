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
  buildImageRequests,
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

const PLUGIN_MODEL: PricingModel = {
  ...imageModel(
    'plugin-image',
    'u("resolution") == "1K" ? tier("1K", u("image_count") * 0.1) : tier("2K", u("image_count") * 0.25)'
  ),
  billing_usage_schema: {
    image_count: { type: 'number', unit: 'count' },
    resolution: { enum: ['1K', '2K'] },
  },
  model_limits: { ratios: ['1:1', '16:9'], maxReferenceImages: 16 },
}

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

  it('reads sizes, ratios and reference limits of a task plugin model', () => {
    expect(studioImageModelsFromPricing([PLUGIN_MODEL])[0].plugin).toEqual({
      resolutions: ['1K', '2K'],
      ratios: ['1:1', '16:9'],
      maxReferences: 16,
    })
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

  it.each([
    ['1K', 1, 0.1],
    ['2K', 3, 0.75],
  ])(
    'charges a task plugin model its %s price for each image',
    (size, count, expected) => {
      expect(estimateImageCostUSD(PLUGIN_MODEL, size, count)).toBeCloseTo(
        expected
      )
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

  it('sends one request per image to a task plugin model', () => {
    const [{ plugin }] = studioImageModelsFromPricing([PLUGIN_MODEL])
    const requests = buildImageRequests(
      draft({ model: 'plugin-image', size: '2K', ratio: '16:9', count: 2 }),
      plugin
    )
    const request = {
      model: 'plugin-image',
      prompt: 'a cat',
      size: '2K',
      aspect_ratio: '16:9',
      n: 1,
      response_format: 'url',
    }
    expect(requests).toEqual([request, request])
  })

  it('rejects references for a task plugin model that takes none', () => {
    const references = [
      {
        id: 'a',
        kind: 'image' as const,
        fileName: 'cat.png',
        previewUrl: 'blob:a',
        status: 'ready' as const,
        progress: 100,
        url: 'https://site.example/cat.png',
      },
    ]
    expect(
      validateImageDraft(draft({ references }), {
        resolutions: [],
        ratios: [],
        maxReferences: 0,
      })
    ).toBe('Too many reference files')
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
