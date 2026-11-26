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
import { create } from 'zustand'

import type { StudioDraft, StudioKind } from '@/features/video-studio/types'

/** A past work another page asks the creation page to load for editing. */
export interface StudioHandoff {
  kind: StudioKind
  draft: Partial<StudioDraft>
  size?: string
  /** Opens the model menu, to try the work on another model. */
  pickModel?: boolean
}

interface StudioHandoffState {
  handoff: StudioHandoff | null
  set: (handoff: StudioHandoff | null) => void
}

// Kept for the tab, so it survives signing up and in on the way to the page.
const STORAGE_KEY = 'video-studio:handoff'

function readStored(): StudioHandoff | null {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? 'null'
    )
    if (!parsed || typeof parsed !== 'object') return null
    const handoff = parsed as StudioHandoff
    return handoff.kind === 'video' || handoff.kind === 'image' ? handoff : null
  } catch {
    return null
  }
}

export const useStudioHandoff = create<StudioHandoffState>((set) => ({
  handoff: readStored(),
  set: (handoff) => {
    try {
      if (handoff) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff))
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Without storage the work only reaches the page within this visit.
    }
    set({ handoff })
  },
}))
