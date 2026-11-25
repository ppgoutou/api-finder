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
import { useQuery } from '@tanstack/react-query'

import { getTaskArtifacts } from '@/features/usage-logs/api'

/** A finished task's videos or images. */
export function useWorkArtifacts(taskId: string, enabled = true) {
  return useQuery({
    queryKey: ['video-studio', 'artifacts', taskId],
    queryFn: async () => {
      try {
        return await getTaskArtifacts(taskId)
      } catch {
        // Without its status, a server error stays on this work's card; the
        // app otherwise replaces the whole page with its error page.
        throw new Error('The work could not be loaded')
      }
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    meta: { errorToast: false },
  })
}

/** Address of a finished video work, once its artifacts are read. */
export function useWorkVideoUrl(taskId: string) {
  const artifacts = useWorkArtifacts(taskId)
  return {
    isLoading: artifacts.isLoading,
    url:
      artifacts.data?.artifacts.find((artifact) => artifact.type === 'video')
        ?.content_url ?? artifacts.data?.legacyContentUrl,
  }
}
