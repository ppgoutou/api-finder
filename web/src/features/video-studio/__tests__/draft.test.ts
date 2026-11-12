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
  DEFAULT_DRAFT,
  DEFAULT_STUDIO_RATIOS,
  STUDIO_RATIOS,
  type StudioModel,
} from '../constants'
import {
  buildVideoRequest,
  estimateDraftCostUSD,
  fitDraftToModel,
  inPlazaOrder,
  labelReferences,
  removeReferenceFromPrompt,
  replacementModel,
  studioModelsFromPricing,
  validateDraft,
} from '../lib/draft'
import type { AssetKind, StudioAsset, StudioDraft } from '../types'

function asset(
  id: string,
  kind: AssetKind,
  status: StudioAsset['status'] = 'ready'
): StudioAsset {
  return {
    id,
    kind,
    fileName: `${id}.bin`,
    previewUrl: `blob:${id}`,
    status,
    progress: status === 'ready' ? 100 : 0,
    url:
      status === 'ready'
        ? `https://site.example/video-assets/${id}`
        : undefined,
  }
}

function draft(patch: Partial<StudioDraft>): StudioDraft {
  return { ...DEFAULT_DRAFT, prompt: 'a cat', ...patch }
}

describe('labelReferences', () => {
  it('numbers references per kind in upload order', () => {
    const labels = labelReferences([
      asset('a', 'image'),
      asset('b', 'video'),
      asset('c', 'image'),
      asset('d', 'audio'),
    ])
    expect(labels.map((entry) => entry.token)).toEqual([
      '图片1',
      '视频1',
      '图片2',
      '音频1',
    ])
  })
})

describe('removeReferenceFromPrompt', () => {
  it('drops mentions of the removed file and renumbers later ones of the same kind', () => {
    const prompt = '@图片1 dances like @视频1 next to @图片2 and @图片3'
    expect(removeReferenceFromPrompt(prompt, 'image', 1)).toBe(
      '@图片1 dances like @视频1 next to  and @图片2'
    )
  })
})

function pricingModel(
  name: string,
  patch: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: 1,
    model_name: name,
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 0,
    enable_groups: ['default'],
    ...patch,
  }
}

/** Per-second video price by resolution, as the pricing API returns it. */
function videoModel(
  name: string,
  resolutions: string[],
  patch: Partial<PricingModel> = {}
): PricingModel {
  const tiers = resolutions.map(
    (resolution) => `tier("${resolution}", u("seconds") * 0.1)`
  )
  const expr = tiers.reduceRight(
    (rest, tier, index) =>
      `u("resolution") == "${resolutions[index]}" ? ${tier} : ${rest}`
  )
  return pricingModel(name, {
    billing_mode: 'tiered_expr',
    billing_expr: resolutions.length === 1 ? tiers[0] : expr,
    billing_usage_schema: {
      resolution: { enum: resolutions },
      seconds: { type: 'number', unit: 'second' },
    },
    ...patch,
  })
}

describe('studioModelsFromPricing', () => {
  it('offers a per-second model whose price also depends on a reference video', () => {
    const [model] = studioModelsFromPricing([
      videoModel('seedance-2.5-reference-switch', ['480p', '720p'], {
        billing_expr:
          'u("resolution") == "480p" && u("video_input") == "none" ? tier("480p·none", u("seconds") * 1) : ' +
          'u("resolution") == "480p" && u("video_input") == "video" ? tier("480p·video", u("seconds") * 2) : ' +
          'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("seconds") * 3) : ' +
          'tier("720p·video", u("seconds") * 4)',
        billing_usage_schema: {
          resolution: { enum: ['480p', '720p'] },
          seconds: { type: 'number', unit: 'second' },
          video_input: { enum: ['none', 'video'] },
        },
      }),
    ])
    expect(model?.resolutions).toEqual(['480p', '720p'])
  })

  it('offers every per-second video model in pricing order with its resolutions', () => {
    const models = studioModelsFromPricing([
      videoModel('seedance-2.5', ['480p', '720p', '1080p'], {
        model_limits: { minDuration: 4, maxDuration: 30 },
      }),
      videoModel('seedance2.0-720p-P', ['720p'], {
        model_limits: { minDuration: 5, maxDuration: 15 },
      }),
    ])
    expect(models).toEqual([
      {
        name: 'seedance-2.5',
        label: 'seedance-2.5',
        resolutions: ['480p', '720p', '1080p'],
        duration: [4, 30],
        ratios: DEFAULT_STUDIO_RATIOS,
      },
      {
        name: 'seedance2.0-720p-P',
        label: 'seedance2.0-720p-P',
        resolutions: ['720p'],
        duration: [5, 15],
        ratios: DEFAULT_STUDIO_RATIOS,
      },
    ])
  })

  it('offers a model billed per video with its resolutions', () => {
    const models = studioModelsFromPricing([
      pricingModel('seedance-2.5-G2-V', {
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", u("videos") * 1.28)',
        billing_usage_schema: {
          resolution: { enum: ['720p'] },
          videos: { type: 'number', unit: 'count' },
        },
        model_limits: { minDuration: 4, maxDuration: 30 },
      }),
    ])
    expect(models).toEqual([
      {
        name: 'seedance-2.5-G2-V',
        label: 'seedance-2.5-G2-V',
        resolutions: ['720p'],
        duration: [4, 30],
        ratios: DEFAULT_STUDIO_RATIOS,
      },
    ])
  })

  it('offers a model billed per video token with its resolutions', () => {
    const models = studioModelsFromPricing([
      pricingModel('seedance-2-0-pro-NSFW', {
        billing_mode: 'tiered_expr',
        billing_expr:
          'u("resolution") == "720p" && u("video_input") == "video" ? tier("720p·video", u("tokens") * 6.708 / 1000000) : ' +
          'u("resolution") == "720p" && u("video_input") == "none" ? tier("720p·none", u("tokens") * 10.92 / 1000000) : ' +
          'u("resolution") == "1080p" && u("video_input") == "video" ? tier("1080p·video", u("tokens") * 7.332 / 1000000) : ' +
          'tier("1080p·none", u("tokens") * 12.012 / 1000000)',
        billing_usage_schema: {
          resolution: { enum: ['720p', '1080p'] },
          tokens: { type: 'number', unit: 'token' },
          video_input: { enum: ['none', 'video'] },
        },
      }),
    ])
    expect(models).toEqual([
      {
        name: 'seedance-2-0-pro-NSFW',
        label: 'seedance-2-0-pro-NSFW',
        resolutions: ['720p', '1080p'],
        duration: [4, 15],
        ratios: DEFAULT_STUDIO_RATIOS,
      },
    ])
  })

  it('takes allowed lengths and ratios from the limits its plugin declares', () => {
    const [model] = studioModelsFromPricing([
      videoModel('F-seedance-2.5-30s', ['480p'], {
        model_limits: {
          minDuration: 4,
          maxDuration: 30,
          durations: [4, 15, 20, 30],
          ratios: ['9:16', '16:9', '5:4'],
        },
      }),
    ])
    expect(model.duration).toEqual([4, 30])
    expect(model.durations).toEqual([4, 15, 20, 30])
    expect(model.ratios).toEqual(['auto', '16:9', '9:16'])
  })

  it('uses 4 to 15 seconds and every Seedance ratio but 9:21 for a video model without declared limits', () => {
    const [model] = studioModelsFromPricing([
      videoModel('seedance-2-0-fast-NSFW', ['480p', '720p']),
    ])
    expect(model.duration).toEqual([4, 15])
    expect(model.durations).toBeUndefined()
    expect(model.ratios).toEqual([
      'auto',
      '21:9',
      '16:9',
      '4:3',
      '1:1',
      '3:4',
      '9:16',
    ])
  })

  it('takes declared reference counts and the default for a kind left out', () => {
    const [model] = studioModelsFromPricing([
      videoModel('seedance2.5-T', ['720p'], {
        model_limits: { maxReferenceImages: 30, maxReferenceVideos: 10 },
      }),
    ])
    expect(model.referenceLimits).toEqual({ image: 30, video: 10, audio: 3 })
  })

  it('leaves reference limits to the defaults when none are declared', () => {
    const [model] = studioModelsFromPricing([
      videoModel('seedance2.0-T', ['720p'], {
        model_limits: { minDuration: 4, maxDuration: 15 },
      }),
    ])
    expect(model.referenceLimits).toBeUndefined()
  })

  it('offers 9:21 only to a video model whose limits declare it', () => {
    const [model] = studioModelsFromPricing([
      videoModel('seedance2.5-T', ['480p', '720p'], {
        model_limits: {
          minDuration: 4,
          maxDuration: 30,
          ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        },
      }),
    ])
    expect(model.duration).toEqual([4, 30])
    expect(model.ratios).toEqual(STUDIO_RATIOS)
  })

  it('leaves out text, image and non-resolution priced models', () => {
    const models = studioModelsFromPricing([
      pricingModel('gpt-4o', { model_ratio: 1.25 }),
      pricingModel('seedream-5.0', {
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("per_image", fixed(0.1296)) * image_count',
      }),
      pricingModel('sora-2', {
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("720x1280", u("seconds") * 0.1)',
        billing_usage_schema: {
          size: { enum: ['720x1280'] },
          seconds: { type: 'number', unit: 'second' },
        },
      }),
    ])
    expect(models).toEqual([])
  })
})

describe('fitDraftToModel', () => {
  const models: StudioModel[] = [
    {
      name: 'seedance-2.0',
      resolutions: ['480p', '720p', '1080p', '4k'],
      duration: [4, 15],
      ratios: STUDIO_RATIOS,
    },
    {
      name: 'seedance-2.5',
      resolutions: ['480p', '720p', '1080p'],
      duration: [4, 30],
      ratios: STUDIO_RATIOS,
    },
  ]

  it('lowers 4k and long durations when switching to seedance-2.5 limits', () => {
    const fitted = fitDraftToModel(
      draft({ model: 'seedance-2.5', resolution: '4k', seconds: 40 }),
      models
    )
    expect(fitted.resolution).toBe('1080p')
    expect(fitted.seconds).toBe(30)
  })

  it('caps seedance-2.0 at 15 seconds and raises short durations to 4', () => {
    expect(fitDraftToModel(draft({ seconds: 20 }), models).seconds).toBe(15)
    expect(fitDraftToModel(draft({ seconds: 1 }), models).seconds).toBe(4)
  })

  it('moves a length between allowed values to the nearest one the model takes', () => {
    const picky: StudioModel = {
      name: 'F-seedance-2.5-30s',
      resolutions: ['480p'],
      duration: [4, 30],
      durations: [4, 15, 20, 30],
      ratios: STUDIO_RATIOS,
    }
    const fit = (seconds: number) =>
      fitDraftToModel(draft({ model: picky.name, seconds }), [picky]).seconds
    expect(fit(16)).toBe(15)
    expect(fit(18)).toBe(20)
    expect(fit(40)).toBe(30)
  })

  it('falls back to auto when the model does not offer the chosen ratio', () => {
    const square: StudioModel = { ...models[1], ratios: ['auto', '1:1'] }
    expect(
      fitDraftToModel(draft({ model: square.name, ratio: '21:9' }), [square])
        .ratio
    ).toBe('auto')
    expect(
      fitDraftToModel(draft({ model: square.name, ratio: '1:1' }), [square])
        .ratio
    ).toBe('1:1')
  })

  it('switches to the first model when the chosen one is no longer offered', () => {
    const fitted = fitDraftToModel(draft({ model: 'retired-model' }), [
      models[1],
    ])
    expect(fitted.model).toBe('seedance-2.5')
  })

  it('keeps the draft unchanged while no model is available', () => {
    const value = draft({ model: 'seedance-2.0', seconds: 40 })
    expect(fitDraftToModel(value, [])).toBe(value)
  })
})

describe('unavailable models', () => {
  const live: StudioModel = {
    name: 'seedance-2.5',
    group: 'Seedance 2.5',
    resolutions: ['720p'],
    duration: [4, 30],
    ratios: STUDIO_RATIOS,
  }
  const outOfStock: StudioModel = {
    ...live,
    name: 'D-sd2.5-G3-1',
    unavailable: true,
    unavailableReason: 'Out of stock',
  }
  const otherGroup: StudioModel = {
    ...live,
    name: 'seedance-2.0',
    group: 'Seedance 2.0',
  }

  it('carries the unavailable flag and reason from pricing', () => {
    const [model] = studioModelsFromPricing([
      videoModel('D-sd2.5-G3-1', ['720p'], {
        unavailable: true,
        unavailable_reason: ' Out of stock ',
      }),
    ])
    expect(model.unavailable).toBe(true)
    expect(model.unavailableReason).toBe('Out of stock')
  })

  it('keeps an unavailable model the user picked so the notice can explain it', () => {
    const fitted = fitDraftToModel(draft({ model: 'D-sd2.5-G3-1' }), [
      outOfStock,
      live,
    ])
    expect(fitted.model).toBe('D-sd2.5-G3-1')
  })

  it('falls back to the first available model when the picked one is gone', () => {
    const fitted = fitDraftToModel(draft({ model: 'retired-model' }), [
      outOfStock,
      live,
    ])
    expect(fitted.model).toBe('seedance-2.5')
  })

  it('offers an available model of the same category as the replacement', () => {
    expect(
      replacementModel([otherGroup, outOfStock, live], outOfStock)?.name
    ).toBe('seedance-2.5')
    expect(replacementModel([otherGroup, outOfStock], outOfStock)?.name).toBe(
      'seedance-2.0'
    )
    expect(replacementModel([outOfStock], outOfStock)).toBeUndefined()
  })
})

describe('validateDraft', () => {
  it.each([
    ['an empty prompt', draft({ prompt: '  ' }), 'Describe the video you want'],
    [
      'a running upload',
      draft({ references: [asset('a', 'image', 'uploading')] }),
      'Wait for the uploads to finish',
    ],
    [
      'a failed upload',
      draft({ references: [asset('a', 'image', 'error')] }),
      'Remove the files that failed to upload',
    ],
    [
      'audio alone',
      draft({ references: [asset('a', 'audio')] }),
      'Audio needs an image or video reference too',
    ],
    [
      'four reference videos',
      draft({
        references: ['a', 'b', 'c', 'd'].map((id) => asset(id, 'video')),
      }),
      'Too many reference files',
    ],
    [
      'frames without a first frame',
      draft({ mode: 'frames', lastFrame: asset('z', 'image') }),
      'Add a first frame image',
    ],
  ])('rejects %s', (_, value, reason) => {
    expect(validateDraft(value)).toBe(reason)
  })

  it('accepts a text-only prompt', () => {
    expect(validateDraft(draft({}))).toBeNull()
  })

  it('accepts ten reference videos when the model declares ten', () => {
    const tenVideos = draft({
      references: Array.from({ length: 10 }, (_, index) =>
        asset(`v${index}`, 'video')
      ),
    })
    const model = { referenceLimits: { image: 30, video: 10, audio: 10 } }
    expect(validateDraft(tenVideos, model)).toBeNull()
    expect(validateDraft(tenVideos)).toBe('Too many reference files')
  })

  it('rejects one file over the limit the model declares', () => {
    const fiveImages = draft({
      references: ['a', 'b', 'c', 'd', 'e'].map((id) => asset(id, 'image')),
    })
    const model = { referenceLimits: { image: 4, video: 3, audio: 3 } }
    expect(validateDraft(fiveImages, model)).toBe('Too many reference files')
  })
})

describe('buildVideoRequest', () => {
  it('sends references by kind and leaves out the ratio on auto', () => {
    const body = buildVideoRequest(
      draft({
        prompt: '  @图片1 walks  ',
        references: [
          asset('a', 'image'),
          asset('b', 'video'),
          asset('c', 'audio'),
        ],
      })
    )
    expect(body).toEqual({
      model: 'seedance-2.0',
      prompt: '@图片1 walks',
      seconds: 5,
      resolution: '720p',
      images: ['https://site.example/video-assets/a'],
      videos: ['https://site.example/video-assets/b'],
      audios: ['https://site.example/video-assets/c'],
    })
  })

  it('sends only the frame URLs in frames mode', () => {
    const body = buildVideoRequest(
      draft({
        mode: 'frames',
        ratio: '9:16',
        references: [asset('a', 'image')],
        firstFrame: asset('f', 'image'),
        lastFrame: asset('l', 'image'),
      })
    )
    expect(body).toEqual({
      model: 'seedance-2.0',
      prompt: 'a cat',
      seconds: 5,
      resolution: '720p',
      ratio: '9:16',
      first_image_url: 'https://site.example/video-assets/f',
      last_image_url: 'https://site.example/video-assets/l',
    })
  })
})

describe('estimateDraftCostUSD', () => {
  const row = {
    secondPrice: 0.1,
    referencePricePerMillion: 4,
    tokensPerSecond: 21600,
  }

  it('charges per second for each video', () => {
    expect(estimateDraftCostUSD(row, 5, 2, false)).toBeCloseTo(1)
  })

  describe('when reference media are priced on top', () => {
    const media = {
      secondPrice: 1,
      inputVideoSecondPrice: 2,
      inputImagePrice: 3,
      freeInputImages: 5,
    }

    it('charges only the output seconds without media', () => {
      expect(estimateDraftCostUSD(media, 10, 1, false)).toBeCloseTo(10)
    })

    it('adds the reserved reference seconds for a reference video', () => {
      expect(estimateDraftCostUSD(media, 10, 1, true)).toBeCloseTo(40)
    })

    it('charges no images up to the free ones', () => {
      expect(estimateDraftCostUSD(media, 10, 1, false, 5)).toBeCloseTo(10)
    })

    it('charges images beyond the free ones, for each video', () => {
      expect(estimateDraftCostUSD(media, 10, 2, true, 9)).toBeCloseTo(104)
    })
  })

  it('charges a flat price per video whatever the length or references', () => {
    const perVideo = { secondPrice: 0, videoPrice: 1.28 }
    expect(estimateDraftCostUSD(perVideo, 30, 2, true)).toBeCloseTo(2.56)
  })

  it('charges reference orders of per-second reference models by output seconds alone', () => {
    const perSecond = { secondPrice: 0.5, referenceSecondPrice: 0.65 }
    expect(estimateDraftCostUSD(perSecond, 10, 2, true)).toBeCloseTo(13)
    expect(estimateDraftCostUSD(perSecond, 10, 2, false)).toBeCloseTo(10)
  })

  it('charges reference orders by tokens with at least 2/3 of the output as reference seconds', () => {
    // 5 s output + ceil(10/3) = 4 s reference = 9 s of tokens.
    expect(estimateDraftCostUSD(row, 5, 1, true)).toBeCloseTo(
      (9 * 21600 * 4) / 1_000_000
    )
  })
})

describe('inPlazaOrder', () => {
  it('orders models by plaza category with the category name, then the uncategorized ones by name', () => {
    const models = inPlazaOrder(
      [
        videoModel('wan3.0', ['720p']),
        videoModel('seedance-2.5', ['720p']),
        videoModel('a-model', ['720p']),
        videoModel('seedance-2.0', ['720p']),
      ],
      [
        { id: 'sd25', name: 'Seedance 2.5', models: ['seedance-2.5'] },
        { id: 'sd20', name: 'Seedance 2.0', models: ['seedance-2.0'] },
      ],
      studioModelsFromPricing
    )
    expect(models.map((model) => [model.name, model.group])).toEqual([
      ['seedance-2.5', 'Seedance 2.5'],
      ['seedance-2.0', 'Seedance 2.0'],
      ['a-model', ''],
      ['wan3.0', ''],
    ])
  })

  it('sorts by name without groups when no category is configured', () => {
    const models = inPlazaOrder(
      [videoModel('wan3.0', ['720p']), videoModel('seedance-2.0', ['720p'])],
      [],
      studioModelsFromPricing
    )
    expect(models.map((model) => [model.name, model.group])).toEqual([
      ['seedance-2.0', undefined],
      ['wan3.0', undefined],
    ])
  })
})
