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
}

interface StudioHandoffState {
  handoff: StudioHandoff | null
  set: (handoff: StudioHandoff | null) => void
}

export const useStudioHandoff = create<StudioHandoffState>((set) => ({
  handoff: null,
  set: (handoff) => set({ handoff }),
}))
