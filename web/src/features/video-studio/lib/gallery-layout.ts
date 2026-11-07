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
import { parseGallerySpec } from './gallery-draft'

/** Width / height named by a spec such as `model · 9:16 · 720p`, if any. */
export function specAspectRatio(spec: string): number | undefined {
  const ratio = parseGallerySpec(spec).ratio
  if (!ratio) return undefined
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return undefined
  return width / height
}

/**
 * Sorts works by the model their spec names. Models keep the order they first
 * appear in, so the admin's ordering still decides what comes first; works
 * without a model form a last group whose `model` is empty.
 */
export function groupByModel<T extends { spec: string }>(
  works: readonly T[]
): { model: string; works: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const work of works) {
    const model = parseGallerySpec(work.spec).model ?? ''
    const group = groups.get(model)
    if (group) group.push(work)
    else groups.set(model, [work])
  }
  return [...groups.entries()]
    .map(([model, grouped]) => ({ model, works: grouped }))
    .sort((a, b) => Number(!a.model) - Number(!b.model))
}
