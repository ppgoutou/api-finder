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
import {
  ASSET_RETENTION_DAYS,
  DEFAULT_DRAFT,
  STUDIO_RATIOS,
} from '../constants'
import type { StudioAsset, StudioDraft, StudioKind, StudioMode } from '../types'
import { removeReferenceFromPrompt, restoredAssets } from './draft'

const MODES: ReadonlySet<StudioMode> = new Set([
  'text',
  'image',
  'frames',
  'reference',
])

type StoredAsset = Pick<StudioAsset, 'kind' | 'fileName' | 'uploadedAt'> & {
  url: string
}

interface StoredDraft {
  mode: StudioMode
  model: string
  prompt: string
  ratio: string
  resolution: string
  seconds: number
  count: number
  references: StoredAsset[]
  firstFrame?: StoredAsset
  lastFrame?: StoredAsset
  /** Image size the user picked, on the image composer. */
  size?: string
  /** Prompt of the last submission, which is safe to replace. */
  submittedPrompt?: string
  /** Unix seconds of the last change. */
  savedAt?: number
}

/** Drafts put aside, newest first, to bring back. */
const RECENT_DRAFTS_LIMIT = 5

/** A draft back from storage, with the image size it was saved with. */
export interface SavedDraft {
  draft: StudioDraft
  size?: string
  /** Unix seconds of the last change, when known. */
  savedAt?: number
}

/** Drafts are kept per account, so accounts sharing a browser never mix. */
function storageKey(kind: StudioKind, userId: number | undefined) {
  return `video-studio:draft:${kind}:${userId ?? 'guest'}`
}

function recentKey(kind: StudioKind, userId: number | undefined) {
  return `video-studio:recent-drafts:${kind}:${userId ?? 'guest'}`
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== 'object') return false
  const stored = value as StoredDraft
  return typeof stored.prompt === 'string' && Array.isArray(stored.references)
}

function readStored(kind: StudioKind, userId?: number): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(kind, userId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isStoredDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readRecent(kind: StudioKind, userId?: number): StoredDraft[] {
  try {
    const raw = window.localStorage.getItem(recentKey(kind, userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isStoredDraft) : []
  } catch {
    return []
  }
}

function writeRecent(
  kind: StudioKind,
  userId: number | undefined,
  drafts: StoredDraft[]
) {
  try {
    window.localStorage.setItem(
      recentKey(kind, userId),
      JSON.stringify(drafts.slice(0, RECENT_DRAFTS_LIMIT))
    )
  } catch {
    // Storage may be full or blocked; the draft is not kept aside then.
  }
}

function writeStored(
  kind: StudioKind,
  userId: number | undefined,
  stored: StoredDraft
) {
  try {
    window.localStorage.setItem(
      storageKey(kind, userId),
      JSON.stringify(stored)
    )
    return true
  } catch {
    // Storage may be full or blocked; the draft lasts until the page closes.
    return false
  }
}

function storedAsset(asset: StudioAsset | undefined): StoredAsset | undefined {
  if (!asset || asset.status !== 'ready' || !asset.url) return undefined
  return {
    kind: asset.kind,
    fileName: asset.fileName,
    url: asset.url,
    ...(asset.uploadedAt ? { uploadedAt: asset.uploadedAt } : {}),
  }
}

function isKept(asset: StoredAsset, now: number): boolean {
  return (
    !asset.uploadedAt ||
    now - asset.uploadedAt < ASSET_RETENTION_DAYS * 24 * 60 * 60
  )
}

function restoredAsset(stored: StoredAsset): StudioAsset {
  const [asset] = restoredAssets(stored.kind, [stored.url])
  return { ...asset, fileName: stored.fileName, uploadedAt: stored.uploadedAt }
}

/** Saves the draft in this browser; false when the browser refuses. */
export function saveDraft(
  kind: StudioKind,
  userId: number | undefined,
  draft: StudioDraft,
  size?: string
): boolean {
  const submittedPrompt = readStored(kind, userId)?.submittedPrompt
  return writeStored(kind, userId, {
    mode: draft.mode,
    model: draft.model,
    prompt: draft.prompt,
    ratio: draft.ratio,
    resolution: draft.resolution,
    seconds: draft.seconds,
    count: draft.count,
    references: draft.references.flatMap((asset) => storedAsset(asset) ?? []),
    firstFrame: storedAsset(draft.firstFrame),
    lastFrame: storedAsset(draft.lastFrame),
    ...(size ? { size } : {}),
    ...(submittedPrompt ? { submittedPrompt } : {}),
    savedAt: Math.floor(Date.now() / 1000),
  })
}

/**
 * The draft saved in this browser. Files the server has deleted since are
 * left out, and their mentions with them. `now` is in Unix seconds.
 */
export function readDraft(
  kind: StudioKind,
  userId: number | undefined,
  now: number
): SavedDraft | null {
  const stored = readStored(kind, userId)
  return stored ? restoredDraft(stored, now) : null
}

function restoredDraft(stored: StoredDraft, now: number): SavedDraft {
  let prompt = stored.prompt
  const references: StoredAsset[] = []
  const seen = { image: 0, video: 0, audio: 0 }
  for (const asset of stored.references) {
    if (isKept(asset, now)) {
      references.push(asset)
      seen[asset.kind] += 1
    } else {
      prompt = removeReferenceFromPrompt(prompt, asset.kind, seen[asset.kind])
    }
  }
  const frame = (asset?: StoredAsset) =>
    asset && isKept(asset, now) ? restoredAsset(asset) : undefined
  return {
    draft: {
      mode: MODES.has(stored.mode) ? stored.mode : DEFAULT_DRAFT.mode,
      model: stored.model || DEFAULT_DRAFT.model,
      prompt,
      ratio: STUDIO_RATIOS.find((ratio) => ratio === stored.ratio) ?? 'auto',
      resolution: stored.resolution || DEFAULT_DRAFT.resolution,
      seconds: Number(stored.seconds) || DEFAULT_DRAFT.seconds,
      count: Number(stored.count) || DEFAULT_DRAFT.count,
      references: references.map(restoredAsset),
      firstFrame: frame(stored.firstFrame),
      lastFrame: frame(stored.lastFrame),
    },
    size: stored.size,
    savedAt: stored.savedAt,
  }
}

/**
 * Puts the saved draft aside among the recent drafts before it is replaced,
 * unless it holds no prompt, was submitted already or is kept aside already.
 */
export function keepDraftAside(kind: StudioKind, userId: number | undefined) {
  const stored = readStored(kind, userId)
  const prompt = stored?.prompt.trim()
  if (!stored || !prompt || prompt === stored.submittedPrompt) return
  const others = readRecent(kind, userId).filter(
    (draft) => draft.prompt.trim() !== prompt
  )
  writeRecent(kind, userId, [stored, ...others])
}

/** Drafts put aside, newest first, as they can be loaded again. */
export function readRecentDrafts(
  kind: StudioKind,
  userId: number | undefined,
  now: number
): SavedDraft[] {
  return readRecent(kind, userId).map((stored) => restoredDraft(stored, now))
}

/** Takes a draft off the recent list, once it is loaded again. */
export function forgetRecentDraft(
  kind: StudioKind,
  userId: number | undefined,
  prompt: string
) {
  writeRecent(
    kind,
    userId,
    readRecent(kind, userId).filter((draft) => draft.prompt !== prompt)
  )
}

/** Remembers that the prompt was submitted, so replacing it loses nothing. */
export function markDraftSubmitted(
  kind: StudioKind,
  userId: number | undefined,
  prompt: string
) {
  const stored = readStored(kind, userId)
  if (!stored) return
  writeStored(kind, userId, { ...stored, submittedPrompt: prompt.trim() })
}

/** Whether loading `incoming` would replace a prompt that was never submitted. */
export function wouldLoseDraft(
  kind: StudioKind,
  userId: number | undefined,
  incoming: string | undefined
): boolean {
  const stored = readStored(kind, userId)
  const prompt = stored?.prompt.trim()
  if (!prompt) return false
  return prompt !== stored?.submittedPrompt && prompt !== incoming?.trim()
}
