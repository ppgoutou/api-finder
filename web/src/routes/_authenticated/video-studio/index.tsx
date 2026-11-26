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
import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'

import { VideoStudio } from '@/features/video-studio'

const videoStudioSearchSchema = z.object({
  /** Model preselected in the composer, such as from a pricing card. */
  model: z.string().optional().catch(undefined),
  /** Whether the page opens on video or image generation. */
  kind: z.enum(['video', 'image']).optional().catch(undefined),
  /** Set by the payment page on the way back. */
  topup: z.enum(['success', 'cancelled']).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/video-studio/')({
  validateSearch: videoStudioSearchSchema,
  component: VideoStudio,
})
