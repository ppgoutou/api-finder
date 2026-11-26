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

import {
  STUDIO_IMAGE_WORKS_KEY,
  STUDIO_IMAGE_WORKS_LIMIT,
} from '@/features/video-studio/constants'
import type {
  ImageGenerationRequest,
  StudioImage,
} from '@/features/video-studio/types'

function storeWorks(works: StudioImage[]) {
  try {
    window.localStorage.setItem(STUDIO_IMAGE_WORKS_KEY, JSON.stringify(works))
  } catch {
    // Storage may be full or blocked; the list still shows this session.
  }
}

function readStoredWorks(): StudioImage[] {
  try {
    const raw = window.localStorage.getItem(STUDIO_IMAGE_WORKS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as StudioImage[]) : []
  } catch {
    return []
  }
}

/** An image request of this page that is still waiting for its reply. */
export interface PendingImages {
  id: string
  prompt: string
  model: string
  size: string
  count: number
  /** Unix seconds. */
  startedAt: number
}

/** An image request that failed, kept as a card to retry. */
export interface FailedImages {
  id: string
  request: ImageGenerationRequest
  /** Why it failed, as shown to the user. */
  reason: string
  /** Unix seconds. */
  failedAt: number
}

interface ImageWorksState {
  works: StudioImage[]
  pending: PendingImages[]
  startGenerating: (request: PendingImages) => void
  stopGenerating: (id: string) => void
  /** Failed requests of this page, newest first; not kept across visits. */
  failed: FailedImages[]
  addFailed: (failed: FailedImages[]) => void
  removeFailed: (id: string) => void
  add: (images: StudioImage[]) => void
  remove: (id: string) => void
}

/**
 * Images generated in this browser, newest first, kept in localStorage. Only
 * models served by a task plugin leave a task record as well, so for the other
 * models this is the only list; upstream image URLs expire, so old entries may
 * stop loading.
 */
export const useStudioImageWorks = create<ImageWorksState>((set) => ({
  works: readStoredWorks(),
  pending: [],
  failed: [],
  addFailed: (failed) =>
    set((state) => ({ failed: [...failed, ...state.failed] })),
  removeFailed: (id) =>
    set((state) => ({
      failed: state.failed.filter((request) => request.id !== id),
    })),
  startGenerating: (request) =>
    set((state) => ({ pending: [request, ...state.pending] })),
  stopGenerating: (id) =>
    set((state) => ({
      pending: state.pending.filter((request) => request.id !== id),
    })),
  add: (images) =>
    set((state) => {
      const works = [...images, ...state.works].slice(
        0,
        STUDIO_IMAGE_WORKS_LIMIT
      )
      storeWorks(works)
      return { works }
    }),
  remove: (id) =>
    set((state) => {
      const works = state.works.filter((work) => work.id !== id)
      storeWorks(works)
      return { works }
    }),
}))
