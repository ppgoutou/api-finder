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
  filterAndSortModels,
  filterByModelType,
  filterByQuotaType,
  filterBySearch,
} from '../lib/filters'
import type { PricingModel } from '../types'

function pricingModel(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    supported_endpoint_types: ['openai'],
    ...overrides,
  }
}

const resolution = { enum: ['720p'] }
const perVideo = pricingModel({
  model_name: 'per-video',
  billing_usage_schema: {
    resolution,
    videos: { type: 'number', unit: 'count' },
  },
})
const perSecond = pricingModel({
  model_name: 'per-second',
  billing_usage_schema: {
    resolution,
    seconds: { type: 'number', unit: 'second' },
  },
})
const perSecondWithReference = pricingModel({
  model_name: 'per-second-with-reference',
  billing_usage_schema: {
    resolution,
    tokens: { type: 'number', unit: 'token' },
  },
})
const perRequest = pricingModel({ model_name: 'per-request', quota_type: 1 })
const image = pricingModel({
  model_name: 'image',
  supported_endpoint_types: ['openai', 'image-generation', 'image-edit'],
})
const models = [perVideo, perSecond, perSecondWithReference, perRequest, image]

function names(items: PricingModel[]): string[] {
  return items.map((item) => item.model_name)
}

describe('pricing type filter', () => {
  it('puts per-video models with plain per-request models when filtering by request', () => {
    expect(names(filterByQuotaType(models, 'request'))).toEqual([
      'per-video',
      'per-request',
    ])
  })

  it('keeps other task-usage models in the duration bucket when filtering by task', () => {
    expect(names(filterByQuotaType(models, 'task'))).toEqual([
      'per-second',
      'per-second-with-reference',
    ])
  })

  it('treats a schema mixing count and seconds as duration billing', () => {
    const mixed = pricingModel({
      billing_usage_schema: {
        seconds: { type: 'number', unit: 'second' },
        videos: { type: 'number', unit: 'count' },
      },
    })
    expect(filterByQuotaType([mixed], 'task')).toEqual([mixed])
    expect(filterByQuotaType([mixed], 'request')).toEqual([])
  })
})

describe('model type filter', () => {
  it('keeps only models serving an image endpoint when filtering by image', () => {
    expect(names(filterByModelType(models, 'image'))).toEqual(['image'])
  })

  it('treats every other model as video when filtering by video', () => {
    expect(names(filterByModelType(models, 'video'))).toEqual([
      'per-video',
      'per-second',
      'per-second-with-reference',
      'per-request',
    ])
  })

  it('still applies the vendor from a deep link while filtering by model type', () => {
    const vendorModel = pricingModel({ model_name: 'a', vendor_name: 'Acme' })
    const otherModel = pricingModel({ model_name: 'b', vendor_name: 'Other' })
    const result = filterAndSortModels([vendorModel, otherModel], {
      search: '',
      vendor: 'Acme',
      group: 'all',
      quotaType: 'all',
      modelType: 'video',
      tag: 'all',
      sortBy: 'name',
    })
    expect(names(result)).toEqual(['a'])
  })
})

describe('pricing search', () => {
  it('finds a model by its display name or by its model ID', () => {
    const named = pricingModel({
      model_name: 'seedance2.0-T',
      display_name: 'Seedance 2.0',
    })
    expect(names(filterBySearch([named, perVideo], 'seedance 2.0'))).toEqual([
      'seedance2.0-T',
    ])
    expect(names(filterBySearch([named, perVideo], '2.0-t'))).toEqual([
      'seedance2.0-T',
    ])
  })
})
