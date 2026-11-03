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

/** Width / height a gallery tile uses before its media reports a size. */
export const DEFAULT_GALLERY_RATIO = 16 / 9

/**
 * Caption height below a tile, in tile widths. Keeps a column of many short
 * landscape clips from looking shorter than it is.
 */
const CAPTION_HEIGHT = 0.28

/** Width / height named by a spec such as `model · 9:16 · 720p`, if any. */
export function specAspectRatio(spec: string): number | undefined {
  const ratio = parseGallerySpec(spec).ratio
  if (!ratio) return undefined
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return undefined
  return width / height
}

/**
 * Spreads tiles over `columnCount` columns in reading order, each tile going
 * to the column that is currently shortest, so a first row reads left to
 * right and mixed portrait / landscape clips keep the columns level.
 * Returns the tile indexes of each column.
 */
export function masonryColumns(
  ratios: readonly number[],
  columnCount: number
): number[][] {
  const count = Math.max(1, Math.floor(columnCount))
  const columns: number[][] = Array.from({ length: count }, () => [])
  const heights: number[] = Array.from({ length: count }, () => 0)
  ratios.forEach((ratio, index) => {
    const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : 1
    let shortest = 0
    for (let column = 1; column < count; column++) {
      if (heights[column] < heights[shortest]) shortest = column
    }
    columns[shortest].push(index)
    heights[shortest] += 1 / safeRatio + CAPTION_HEIGHT
  })
  return columns
}
