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

import type { VideoTaskRequest } from '@/features/video-studio/types'

/** A video the user asked for whose task the works list does not show yet. */
export interface PendingVideo {
  id: string
  request: VideoTaskRequest
  spec: string
  /** Unix seconds. */
  startedAt: number
  /** Set once the server created the task. */
  taskId?: string
}

interface StudioPendingState {
  videos: PendingVideo[]
  add: (videos: PendingVideo[]) => void
  created: (id: string, taskId: string) => void
  remove: (ids: readonly string[]) => void
}

/** Submissions under way, so their cards show at once on any page. */
export const useStudioPending = create<StudioPendingState>((set) => ({
  videos: [],
  add: (videos) => set((state) => ({ videos: [...videos, ...state.videos] })),
  created: (id, taskId) =>
    set((state) => ({
      videos: state.videos.map((video) =>
        video.id === id ? { ...video, taskId } : video
      ),
    })),
  remove: (ids) =>
    set((state) => ({
      videos: state.videos.filter((video) => !ids.includes(video.id)),
    })),
}))
