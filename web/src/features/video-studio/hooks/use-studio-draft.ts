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
import { useEffect, useRef, useState } from 'react'

import { useAuthStore } from '@/stores/auth-store'

import { DEFAULT_DRAFT } from '../constants'
import { removeReferenceFromPrompt } from '../lib/draft'
import {
  forgetRecentDraft,
  keepDraftAside,
  readDraft,
  saveDraft,
  type SavedDraft,
} from '../lib/draft-storage'
import type { StudioAsset, StudioDraft, StudioKind } from '../types'

type FrameSlot = 'first' | 'last'

/**
 * Draft state of the composer, as the user picked it; readers fit it to the
 * available models. Upload callbacks keep reporting progress after a file is
 * removed, so removed assets are remembered and their late updates ignored.
 *
 * The draft is saved in this browser on every change and comes back on the
 * next visit. A past work loaded for editing takes its place; a model picked
 * on entry only replaces its model.
 */
export function useStudioDraft(
  kind: StudioKind,
  initial: { draft?: Partial<StudioDraft>; model?: string; size?: string } = {}
) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [saved] = useState(() =>
    initial.draft
      ? null
      : readDraft(kind, userId, Math.floor(Date.now() / 1000))
  )
  const [draft, setDraft] = useState<StudioDraft>(() => ({
    ...(saved?.draft ?? DEFAULT_DRAFT),
    ...initial.draft,
    ...(!initial.draft && initial.model ? { model: initial.model } : {}),
  }))
  const [size, setSize] = useState(initial.size ?? saved?.size)
  const [stored, setStored] = useState(true)
  const changed = useRef(false)
  const removedIds = useRef(new Set<string>())

  useEffect(() => {
    // Opening the page alone saves nothing.
    if (!changed.current && !initial.draft) {
      changed.current = true
      return
    }
    changed.current = true
    setStored(saveDraft(kind, userId, draft, size))
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- initial is read once
  }, [kind, userId, draft, size])

  // When the draft came back from an earlier visit, until it is changed.
  const [restoredAt, setRestoredAt] = useState(() =>
    saved && saved.draft.prompt.trim() ? saved.savedAt : undefined
  )

  const clear = () => {
    keepDraftAside(kind, userId)
    setRestoredAt(undefined)
    setDraft((current) => ({
      ...current,
      prompt: '',
      references: [],
      firstFrame: undefined,
      lastFrame: undefined,
    }))
  }

  /** Loads a recent draft, putting the current one aside. */
  const restore = (recent: SavedDraft) => {
    keepDraftAside(kind, userId)
    forgetRecentDraft(kind, userId, recent.draft.prompt)
    setRestoredAt(undefined)
    setDraft(recent.draft)
    if (recent.size) setSize(recent.size)
  }

  const update = (patch: Partial<StudioDraft>) => {
    setRestoredAt(undefined)
    setDraft((current) => ({ ...current, ...patch }))
  }

  const putReference = (asset: StudioAsset) => {
    if (removedIds.current.has(asset.id)) return
    setDraft((current) => {
      const exists = current.references.some((item) => item.id === asset.id)
      const references = exists
        ? current.references.map((item) =>
            item.id === asset.id ? asset : item
          )
        : [...current.references, asset]
      return { ...current, references }
    })
  }

  const removeReference = (asset: StudioAsset) => {
    removedIds.current.add(asset.id)
    URL.revokeObjectURL(asset.previewUrl)
    setDraft((current) => {
      const sameKind = current.references.filter(
        (item) => item.kind === asset.kind
      )
      const index = sameKind.findIndex((item) => item.id === asset.id)
      if (index < 0) return current
      return {
        ...current,
        prompt: removeReferenceFromPrompt(current.prompt, asset.kind, index),
        references: current.references.filter((item) => item.id !== asset.id),
      }
    })
  }

  const putFrame = (slot: FrameSlot, asset: StudioAsset) => {
    if (removedIds.current.has(asset.id)) return
    setDraft((current) =>
      slot === 'first'
        ? { ...current, firstFrame: asset }
        : { ...current, lastFrame: asset }
    )
  }

  const removeFrame = (slot: FrameSlot) => {
    setDraft((current) => {
      const asset = slot === 'first' ? current.firstFrame : current.lastFrame
      if (asset) {
        removedIds.current.add(asset.id)
        URL.revokeObjectURL(asset.previewUrl)
      }
      return slot === 'first'
        ? { ...current, firstFrame: undefined }
        : { ...current, lastFrame: undefined }
    })
  }

  return {
    draft,
    /** Whether the browser keeps the draft, for the saved hint. */
    stored,
    /** Image size kept with the draft. */
    size,
    setSize,
    /** Unix seconds of the restored draft, until it is changed. */
    restoredAt,
    clear,
    restore,
    update,
    putReference,
    removeReference,
    putFrame,
    removeFrame,
  }
}
