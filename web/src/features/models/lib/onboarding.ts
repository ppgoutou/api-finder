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
import type { ModelPricingEntry } from '@/features/model-pricing/api'
import type {
  PricingCategory,
  PricingModelBadge,
} from '@/features/pricing/types'

import type {
  MetadataSyncValues,
  OnboardingChannel,
  OnboardingModel,
  Vendor,
} from '../types'
import { parseModelTags } from './model-utils'

/** What still blocks a model from being sold; undefined means unknown. */
export type OnboardingStatus = {
  pending: boolean
  removed: boolean
  priceChanged: boolean
  onChannel: boolean
  hasMetadata: boolean
  hasPrice: boolean | undefined
  category: string | undefined
}

export type OnboardingFilter = 'todo' | 'pending' | 'removed' | 'priced' | 'all'

/** A model counts as priced when any effective price other than the display-only official price exists. */
export function hasEffectivePricing(entry: ModelPricingEntry): boolean {
  return Object.entries(entry.effective).some(([key, value]) => {
    if (key === 'billing_setting.official_price_expr') return false
    if (value === undefined || value === null || value === '') return false
    if (typeof value === 'object') return Object.keys(value).length > 0
    return true
  })
}

/**
 * Usage fields a price expression reads that the task plugin's schema lacks.
 * Saving such a price is refused, so the plugin must be updated first. Models
 * without a schema have nothing to check against.
 */
export function undeclaredUsageKeys(
  expression: unknown,
  schema: Record<string, unknown> | undefined
): string[] {
  if (typeof expression !== 'string' || !schema) return []
  const keys = [...expression.matchAll(/\bu\(\s*"([^"]+)"\s*\)/g)].map(
    (match) => match[1]
  )
  return [...new Set(keys)].filter((key) => !(key in schema))
}

export function onboardingStatus(
  item: OnboardingModel,
  priced: Set<string> | undefined,
  categoryOwners: Map<string, string>,
  repriced: Set<string> = new Set()
): OnboardingStatus {
  return {
    priceChanged: repriced.has(item.model_name),
    pending: item.pending_channels.length > 0,
    removed: item.removed_channels.length > 0,
    onChannel: item.channels.length > 0,
    hasMetadata: item.metadata_id > 0 || Boolean(item.metadata_rule),
    hasPrice: priced ? priced.has(item.model_name) : undefined,
    category: categoryOwners.get(item.model_name),
  }
}

/** Unfinished means it still waits on a channel, metadata, or a price, or its upstream dropped or repriced it. */
export function isOnboardingUnfinished(status: OnboardingStatus): boolean {
  return (
    status.pending ||
    status.removed ||
    status.priceChanged ||
    !status.onChannel ||
    !status.hasMetadata ||
    status.hasPrice === false
  )
}

export function matchesOnboardingFilter(
  status: OnboardingStatus,
  filter: OnboardingFilter
): boolean {
  if (filter === 'pending') return status.pending
  if (filter === 'removed') return status.removed
  if (filter === 'priced') return status.priceChanged
  if (filter === 'todo') return isOnboardingUnfinished(status)
  return true
}

/** Distinct groups served by the given channels, in first-seen order. */
export function channelGroups(channels: OnboardingChannel[]): string[] {
  const groups = new Set<string>()
  for (const channel of channels) {
    for (const group of channel.group.split(',')) {
      if (group.trim()) groups.add(group.trim())
    }
  }
  return [...groups]
}

/**
 * Moves a model into one category (or out of every category when categoryId
 * is null) and sets its badges there. A model belongs to at most one category.
 */
export function assignModelCategory(
  categories: PricingCategory[],
  modelName: string,
  categoryId: string | null,
  badges: PricingModelBadge[]
): PricingCategory[] {
  return categories.map((category) => {
    const restBadges = { ...category.badges }
    delete restBadges[modelName]
    const rest = {
      ...category,
      models: category.models.filter((name) => name !== modelName),
      badges: Object.keys(restBadges).length > 0 ? restBadges : undefined,
    }
    if (category.id !== categoryId) return rest
    return {
      ...rest,
      models: category.models.includes(modelName)
        ? category.models
        : [...category.models, modelName],
      badges:
        badges.length > 0
          ? { ...restBadges, [modelName]: badges }
          : rest.badges,
    }
  })
}

/**
 * Joins per-language descriptions into language blocks; one distinct text is
 * stored as-is so single-language sites keep plain descriptions.
 */
export function joinDescriptions(
  descriptions: Array<{ locale: string; text: string }>
): string {
  const present = descriptions.filter((item) => item.text.trim())
  const distinct = new Set(present.map((item) => item.text.trim()))
  if (distinct.size <= 1) return present[0]?.text.trim() ?? ''
  return present
    .map((item) => `<!-- lang:${item.locale} -->\n${item.text.trim()}`)
    .join('\n')
}

/** Form values suggested by the official catalog, keeping vendor only when it already exists here. */
export function officialMetadataValues(
  upstream: MetadataSyncValues,
  description: string,
  vendors: Vendor[]
): { description: string; icon: string; tags: string[]; vendorId?: number } {
  const vendorName = upstream.vendor.trim().toLowerCase()
  const vendor = vendorName
    ? vendors.find((item) => item.name.trim().toLowerCase() === vendorName)
    : undefined
  return {
    description,
    icon: upstream.icon,
    tags: parseModelTags(upstream.tags),
    vendorId: vendor?.id,
  }
}

/** Shows an upstream pricing value; objects (plugin prices) as compact JSON. */
export function formatUpstreamPriceValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
