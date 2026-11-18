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
import type { TFunction } from 'i18next'

import { FILTER_ALL } from '../constants'
import type { PricingCategory, PricingModel, PricingModelBadge } from '../types'

/** Card badges in the order they are offered and shown. */
export const PRICING_MODEL_BADGES = [
  'recommended',
  'hot',
  'new',
  'stable',
  'nsfw',
] as const satisfies readonly PricingModelBadge[]

/**
 * Label of a card badge; HOT, NEW and NSFW read the same in every language. A
 * stable card shows no label, so only administrators see the stable one.
 */
export function modelBadgeLabel(
  badge: PricingModelBadge,
  t: TFunction
): string {
  if (badge === 'recommended') return t('Recommended')
  if (badge === 'stable') return t('Stable')
  if (badge === 'nsfw') return 'NSFW'
  return badge === 'hot' ? 'HOT' : 'NEW'
}

/** Filter value and section id for models outside every category. */
export const UNCATEGORIZED_CATEGORY = '__uncategorized'

export type PricingCategorySection = {
  /** Category id, or UNCATEGORIZED_CATEGORY for the trailing section. */
  id: string
  name: string
  description?: string
  comparison?: string
  models: PricingModel[]
}

function categorizedModelNames(categories: PricingCategory[]): Set<string> {
  return new Set(categories.flatMap((category) => category.models))
}

/**
 * Splits already filtered models into the administrator's categories, in the
 * configured category and model order, followed by one section for the
 * remaining models in their current order. Empty sections are dropped. With no
 * categories configured the page keeps its flat list, so this returns [].
 */
export function groupModelsByCategory(
  models: PricingModel[],
  categories: PricingCategory[]
): PricingCategorySection[] {
  if (categories.length === 0) return []
  const byName = new Map(models.map((model) => [model.model_name, model]))
  const sections: PricingCategorySection[] = []
  for (const category of categories) {
    const members = category.models.flatMap((name) => {
      const model = byName.get(name)
      return model ? [model] : []
    })
    if (members.length > 0) {
      sections.push({
        id: category.id,
        name: category.name,
        description: category.description,
        comparison: category.comparison,
        models: members,
      })
    }
  }
  const categorized = categorizedModelNames(categories)
  const rest = models.filter((model) => !categorized.has(model.model_name))
  if (rest.length > 0) {
    sections.push({ id: UNCATEGORIZED_CATEGORY, name: '', models: rest })
  }
  return sections
}

/** Keeps the models of one category, or of none for UNCATEGORIZED_CATEGORY. */
export function filterByCategory(
  models: PricingModel[],
  categoryId: string,
  categories: PricingCategory[]
): PricingModel[] {
  if (categoryId === FILTER_ALL) return models
  if (categoryId === UNCATEGORIZED_CATEGORY) {
    const categorized = categorizedModelNames(categories)
    return models.filter((model) => !categorized.has(model.model_name))
  }
  const category = categories.find((item) => item.id === categoryId)
  if (!category) return models
  const members = new Set(category.models)
  return models.filter((model) => members.has(model.model_name))
}

/** Maps each model name to its card badges, in PRICING_MODEL_BADGES order. */
export function modelBadgesByName(
  categories: PricingCategory[]
): Map<string, PricingModelBadge[]> {
  const result = new Map<string, PricingModelBadge[]>()
  for (const category of categories) {
    for (const [name, badges] of Object.entries(category.badges ?? {})) {
      const known = PRICING_MODEL_BADGES.filter((badge) =>
        badges.includes(badge)
      )
      if (known.length > 0) result.set(name, known)
    }
  }
  return result
}

/** Starts a top-level Markdown list item. */
const COMPARISON_ITEM = /^(?:[-*+]|\d+[.)])\s+/
/** Starts a top-level list item that leads with a bold model name. */
const COMPARISON_LABELED_ITEM = /^(?:[-*+]|\d+[.)])\s+\*\*(.+?)\*\*/
/** Starts a new Markdown block even right after a list item line. */
const COMPARISON_BLOCK_START = /^(?:#|>|```|---|\*\*\*)/

/**
 * Words a comparison label or a model name is matched by, in lower case. A
 * trailing note in brackets is dropped when it is full-width or holds spaces
 * or non-ASCII text, such as （官方 · 国内线路） or (official · China route);
 * a short tag such as (F) stays a word of its own, so "Seedance 2.0 (F)" and
 * "Seedance 2.0 (D)" remain different models.
 */
function comparisonNameWords(name: string): string[] {
  let text = name
    .trim()
    .replace(/[:：]$/, '')
    .trim()
  const note = /\s*(?:（[^（）]*）|\(([^()]*)\))$/.exec(text)
  if (note && (note[1] === undefined || /[\s\u0080-\uffff]/.test(note[1]))) {
    text = text.slice(0, note.index)
  }
  return text
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('(', ' (')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Comparison text a visitor sees for the models of a category they can see.
 * Each top-level list item that leads with a bold model name is kept, with its
 * indented and continuation lines, only when every word of that name is in the
 * display name or model name of one shown model, so a short label such as
 * "Doubao Mini" still finds "Doubao Seedance 2.0 Mini". Text in no such item
 * is kept. With fewer than two named models left there is nothing to compare,
 * so the result is empty; text that names no model is returned unchanged.
 */
export function comparisonForModels(
  comparison: string,
  models: Pick<PricingModel, 'model_name' | 'display_name'>[]
): string {
  const shown = models.flatMap((model) =>
    [model.model_name, model.display_name ?? ''].flatMap((name) =>
      name.trim() ? [new Set(comparisonNameWords(name))] : []
    )
  )
  const isShown = (label: string) => {
    const words = comparisonNameWords(label)
    return (
      words.length > 0 &&
      shown.some((nameWords) => words.every((word) => nameWords.has(word)))
    )
  }
  const kept: string[] = []
  let named = 0
  let keptNamed = 0
  let dropping = false
  let previousBlank = true
  for (const line of comparison.split('\n')) {
    const blank = line.trim() === ''
    if (COMPARISON_ITEM.test(line)) {
      const label = COMPARISON_LABELED_ITEM.exec(line)?.[1]
      dropping = label !== undefined && !isShown(label)
      if (label !== undefined) named++
      if (label !== undefined && !dropping) keptNamed++
    } else if (
      !blank &&
      !/^\s/.test(line) &&
      (previousBlank || COMPARISON_BLOCK_START.test(line))
    ) {
      dropping = false
    }
    if (!dropping || blank) kept.push(line)
    previousBlank = blank
  }
  if (named === 0) return comparison
  if (keptNamed < 2) return ''
  return kept
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}
