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
import { z } from 'zod'

import { PRICING_MODEL_BADGES } from '@/features/pricing/lib/categories'
import type {
  OfficialPriceTable,
  PricingCategory,
  PricingModelBadge,
} from '@/features/pricing/types'

// Pressed toggles take the badge's card color so a selection is obvious.
export const PRESSED_BADGE_CLASSES: Record<PricingModelBadge, string> = {
  recommended:
    'aria-pressed:border-[#2f6bff] aria-pressed:bg-[#2f6bff] aria-pressed:text-white aria-pressed:hover:bg-[#2f6bff]/90 aria-pressed:hover:text-white',
  hot: 'aria-pressed:border-[#ff4d2e] aria-pressed:bg-[#ff4d2e] aria-pressed:text-white aria-pressed:hover:bg-[#ff4d2e]/90 aria-pressed:hover:text-white',
  new: 'aria-pressed:border-[#16c784] aria-pressed:bg-[#16c784] aria-pressed:text-neutral-950 aria-pressed:hover:bg-[#16c784]/90 aria-pressed:hover:text-neutral-950',
  stable:
    'aria-pressed:border-success aria-pressed:bg-success aria-pressed:text-success-foreground aria-pressed:hover:bg-success/90 aria-pressed:hover:text-success-foreground',
  nsfw: 'aria-pressed:border-[#d6246e] aria-pressed:bg-[#d6246e] aria-pressed:text-white aria-pressed:hover:bg-[#d6246e]/90 aria-pressed:hover:text-white',
}

export const PRICING_CATEGORIES_OPTION_KEY = 'PricingCategories'
export const PRICING_CATEGORY_NAME_MAX = 40
export const PRICING_CATEGORY_DESCRIPTION_MAX = 3000

export const pricingCategoryFormSchema = z.object({
  name: z.string().trim().min(1).max(PRICING_CATEGORY_NAME_MAX),
  description: z.string().max(PRICING_CATEGORY_DESCRIPTION_MAX),
  models: z.array(z.string()),
  badges: z.record(z.string(), z.array(z.enum(PRICING_MODEL_BADGES))),
  officialPriceExpr: z.string(),
  officialPrice: z.custom<OfficialPriceTable | null>(),
})

export type PricingCategoryFormValues = z.infer<
  typeof pricingCategoryFormSchema
>

/** Reads the stored option; an empty or malformed value means no categories. */
export function parsePricingCategories(
  value: string | undefined
): PricingCategory[] {
  if (!value?.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): PricingCategory[] => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      if (typeof record.id !== 'string' || typeof record.name !== 'string') {
        return []
      }
      return [
        {
          id: record.id,
          name: record.name,
          description:
            typeof record.description === 'string' ? record.description : '',
          models: Array.isArray(record.models)
            ? record.models.filter(
                (model): model is string => typeof model === 'string'
              )
            : [],
          badges: parseModelBadges(record.badges),
          ...(record.official_price && typeof record.official_price === 'object'
            ? { official_price: record.official_price as OfficialPriceTable }
            : {}),
          ...(typeof record.official_price_expr === 'string' &&
          record.official_price_expr.trim()
            ? { official_price_expr: record.official_price_expr }
            : {}),
        },
      ]
    })
  } catch {
    return []
  }
}

function parseModelBadges(
  value: unknown
): Record<string, PricingModelBadge[]> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const result: Record<string, PricingModelBadge[]> = {}
  for (const [name, badges] of Object.entries(value)) {
    if (!Array.isArray(badges)) continue
    const known = PRICING_MODEL_BADGES.filter((badge) => badges.includes(badge))
    if (known.length > 0) result[name] = known
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Badges of the selected models only, dropping models without any; undefined
 * when no model has a badge, so the stored option leaves the field out.
 */
export function selectedModelBadges(
  models: string[],
  badges: Record<string, PricingModelBadge[]>
): Record<string, PricingModelBadge[]> | undefined {
  const result: Record<string, PricingModelBadge[]> = {}
  for (const name of models) {
    if (badges[name]?.length) result[name] = badges[name]
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function newPricingCategoryId(existing: PricingCategory[]): string {
  const taken = new Set(existing.map((category) => category.id))
  let id = ''
  do {
    id = `cat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  } while (taken.has(id))
  return id
}

/** Maps each model to the name of the category that already holds it. */
export function pricingCategoryOwners(
  categories: PricingCategory[],
  exceptId?: string
): Map<string, string> {
  const owners = new Map<string, string>()
  for (const category of categories) {
    if (category.id === exceptId) continue
    for (const model of category.models) owners.set(model, category.name)
  }
  return owners
}

/** Returns a copy with the item at index moved one step up or down. */
export function moveOneStep<T>(
  items: T[],
  index: number,
  direction: -1 | 1
): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}
