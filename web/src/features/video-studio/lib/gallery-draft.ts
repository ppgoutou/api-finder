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
import { STUDIO_RATIOS } from '../constants'
import type { StudioDraft, StudioRatio } from '../types'

import { restoredAssets } from './draft'

/** Fields a gallery card may carry into the composer. */
export type GalleryReuseSource = {
  prompt: string
  /** e.g. `seedance-2.0 · 1080p · 10s` or `model · 16:9 · 720p · 5s`. */
  spec?: string
  /** Optional reference / first-frame image URL. */
  image?: string
}

export type ParsedGallerySpec = {
  model?: string
  ratio?: StudioRatio
  resolution?: string
  seconds?: number
}

const RESOLUTION_RE = /^\d{3,4}\s*p$/i
const RATIO_RE = /^\d{1,2}:\d{1,2}$/
const SECONDS_RE = /^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|秒)$/i

/**
 * Reads model / ratio / resolution / duration from a showcase-style spec
 * line. Unknown segments are ignored; the first leftover segment is the model.
 */
export function parseGallerySpec(spec: string): ParsedGallerySpec {
  const parts = spec
    .split(/[·|]/)
    .map((part) => part.trim())
    .filter(Boolean)
  const parsed: ParsedGallerySpec = {}
  const leftovers: string[] = []
  for (const part of parts) {
    if (!parsed.resolution && RESOLUTION_RE.test(part)) {
      parsed.resolution = part.replaceAll(/\s+/g, '').toLowerCase()
      continue
    }
    if (!parsed.ratio && RATIO_RE.test(part)) {
      const ratio = STUDIO_RATIOS.find((value) => value === part)
      if (ratio && ratio !== 'auto') {
        parsed.ratio = ratio
        continue
      }
    }
    if (parsed.seconds === undefined) {
      const match = part.match(SECONDS_RE)
      if (match) {
        const seconds = Number(match[1])
        if (Number.isFinite(seconds) && seconds > 0) {
          parsed.seconds = Math.round(seconds)
          continue
        }
      }
    }
    leftovers.push(part)
  }
  if (leftovers[0]) parsed.model = leftovers[0]
  return parsed
}

/**
 * Builds a partial studio draft from a gallery card so the composer can
 * reuse its prompt and generation parameters. Does not submit.
 */
export function draftFromGalleryItem(
  item: GalleryReuseSource
): Partial<StudioDraft> {
  const parsed = parseGallerySpec(item.spec ?? '')
  const draft: Partial<StudioDraft> = {
    prompt: item.prompt,
    count: 1,
  }
  if (parsed.model) draft.model = parsed.model
  if (parsed.ratio) draft.ratio = parsed.ratio
  if (parsed.resolution) draft.resolution = parsed.resolution
  if (parsed.seconds !== undefined) draft.seconds = parsed.seconds

  const image = item.image?.trim()
  if (image) {
    const [firstFrame] = restoredAssets('image', [image])
    return {
      ...draft,
      mode: 'frames',
      firstFrame,
      lastFrame: undefined,
      references: [],
    }
  }
  return {
    ...draft,
    mode: 'reference',
    references: [],
  }
}
