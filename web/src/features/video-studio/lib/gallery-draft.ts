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
import { STUDIO_RATIOS, type StudioModel } from '../constants'
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
 * Model series a gallery work is labelled with: model plaza categories whose
 * models the studio offers. A work names the series, not one supplier's model.
 */
export const GALLERY_MODEL_SERIES = [
  'Seedance 2.0',
  'Seedance 2.5',
  'Wan 3.0',
  'MiniMax-H3',
] as const

/**
 * The series among `models` (studio models tagged with their plaza category),
 * each taking every ratio, resolution and length one of its models takes.
 */
export function gallerySeries(models: readonly StudioModel[]): StudioModel[] {
  return GALLERY_MODEL_SERIES.flatMap((name) => {
    const members = models.filter((model) => model.group === name)
    if (members.length === 0) return []
    const ratios = STUDIO_RATIOS.filter((ratio) =>
      members.some((model) => model.ratios.includes(ratio))
    )
    const resolutions = [
      ...new Set(members.flatMap((model) => model.resolutions)),
    ].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    const duration: [number, number] = [
      Math.min(...members.map((model) => model.duration[0])),
      Math.max(...members.map((model) => model.duration[1])),
    ]
    const series: StudioModel = {
      name,
      group: name,
      resolutions,
      duration,
      ratios,
    }
    // Lengths are a list only when every model of the series is that picky.
    if (members.every((model) => model.durations?.length)) {
      series.durations = [
        ...new Set(members.flatMap((model) => model.durations ?? [])),
      ].sort((a, b) => a - b)
    }
    return [series]
  })
}

/**
 * The studio model a spec runs on: the model it names, else the first
 * available model of the series it names that takes its ratio, resolution and
 * length, else the series' first available model.
 */
export function galleryModelFor(
  models: readonly StudioModel[],
  spec: ParsedGallerySpec
): string | undefined {
  if (!spec.model) return undefined
  if (models.some((model) => model.name === spec.model)) return spec.model
  const members = models.filter(
    (model) => model.group === spec.model && !model.unavailable
  )
  const fitting = members.find(
    (model) =>
      (!spec.ratio || model.ratios.includes(spec.ratio)) &&
      (!spec.resolution || model.resolutions.includes(spec.resolution)) &&
      (spec.seconds === undefined ||
        (spec.seconds >= model.duration[0] &&
          spec.seconds <= model.duration[1] &&
          (!model.durations?.length || model.durations.includes(spec.seconds))))
  )
  return (fitting ?? members[0])?.name
}

/** Writes a spec line in the form {@link parseGallerySpec} reads back. */
export function formatGallerySpec(spec: ParsedGallerySpec): string {
  return [
    spec.model,
    spec.ratio,
    spec.resolution,
    spec.seconds === undefined ? undefined : `${spec.seconds}s`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Builds a partial studio draft from a gallery card so the composer can
 * reuse its prompt and generation parameters, on the studio model that
 * {@link galleryModelFor} picks. Does not submit. Upstream video
 * services fetch the first frame themselves, so an uploaded `/home-media/`
 * image gets the site's public address in front.
 */
export function draftFromGalleryItem(
  item: GalleryReuseSource,
  studio: { serverAddress: string; models: readonly StudioModel[] }
): Partial<StudioDraft> {
  const parsed = parseGallerySpec(item.spec ?? '')
  const draft: Partial<StudioDraft> = {
    prompt: item.prompt,
    count: 1,
  }
  const model = galleryModelFor(studio.models, parsed) ?? parsed.model
  if (model) draft.model = model
  if (parsed.ratio) draft.ratio = parsed.ratio
  if (parsed.resolution) draft.resolution = parsed.resolution
  if (parsed.seconds !== undefined) draft.seconds = parsed.seconds

  let image = item.image?.trim()
  if (image?.startsWith('/')) {
    image = studio.serverAddress.replace(/\/+$/, '') + image
  }
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
