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
/**
 * Video-studio gallery settings stored in the `StudioGallery` option as JSON.
 * Separate from the home page `HomeShowcase` so homepage clips and studio
 * gallery works are edited independently.
 */
import {
  EMPTY_SHOWCASE_ITEM,
  HOME_MEDIA_URL_PREFIX,
  type HomeShowcaseItem,
  localizeShowcaseItem,
} from '@/features/home/lib/home-showcase'

export type StudioGalleryItem = HomeShowcaseItem

export type StudioGallerySettings = {
  items: StudioGalleryItem[]
}

export const STUDIO_GALLERY_OPTION_KEY = 'StudioGallery'
export const STUDIO_GALLERY_MAX_ITEMS = 30
export const EMPTY_STUDIO_GALLERY: StudioGallerySettings = { items: [] }

function readItem(value: unknown): StudioGalleryItem {
  const source =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const text = (key: string) =>
    typeof source[key] === 'string' ? (source[key] as string) : ''
  return {
    title: text('title'),
    category: text('category'),
    prompt: text('prompt'),
    titleZh: text('title_zh'),
    categoryZh: text('category_zh'),
    promptZh: text('prompt_zh'),
    spec: text('spec'),
    video: text('video'),
    poster: text('poster'),
    image: text('image'),
  }
}

function toStoredItem(item: StudioGalleryItem) {
  return {
    title: item.title,
    category: item.category,
    prompt: item.prompt,
    title_zh: item.titleZh,
    category_zh: item.categoryZh,
    prompt_zh: item.promptZh,
    spec: item.spec,
    video: item.video,
    poster: item.poster,
    image: item.image,
  }
}

function hasContent(item: StudioGalleryItem): boolean {
  return Object.values(item).some((value) => value.trim() !== '')
}

/** Parses the stored option; unreadable or empty values give an empty gallery. */
export function parseStudioGallery(
  raw: string | undefined
): StudioGallerySettings {
  if (!raw?.trim()) return EMPTY_STUDIO_GALLERY
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return EMPTY_STUDIO_GALLERY
  }
  if (!data || typeof data !== 'object') return EMPTY_STUDIO_GALLERY
  const record = data as Record<string, unknown>
  return {
    items: Array.isArray(record.items) ? record.items.map(readItem) : [],
  }
}

/** Serializes gallery settings; an empty list becomes '' so the option clears. */
export function serializeStudioGallery(
  settings: StudioGallerySettings
): string {
  const items = settings.items.filter(hasContent)
  if (items.length === 0) return ''
  return JSON.stringify({ items: items.map(toStoredItem) })
}

/** Uploaded files referenced by the gallery, as `/home-media/...` URLs. */
export function collectStudioGalleryMedia(
  settings: StudioGallerySettings
): string[] {
  return settings.items
    .flatMap((item) => [item.video, item.poster, item.image])
    .filter((url) => url.startsWith(HOME_MEDIA_URL_PREFIX))
}

export function localizeStudioGalleryItem(
  item: StudioGalleryItem,
  language: string
): StudioGalleryItem {
  return localizeShowcaseItem(item, language)
}

export function emptyStudioGalleryItem(): StudioGalleryItem {
  return { ...EMPTY_SHOWCASE_ITEM }
}
