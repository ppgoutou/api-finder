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
import * as z from 'zod'

import { HOME_MEDIA_URL_PREFIX } from '@/features/home/lib/home-showcase'
import { STUDIO_GALLERY_MAX_ITEMS } from '@/features/video-studio/lib/studio-gallery'

const mediaUrl = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === '' ||
      value.startsWith(HOME_MEDIA_URL_PREFIX) ||
      value.startsWith('https://'),
    { message: 'Use an uploaded file or an https link' }
  )

const galleryItemSchema = z.object({
  title: z.string().trim().max(80, { message: 'At most 80 characters' }),
  category: z.string().trim().max(20, { message: 'At most 20 characters' }),
  prompt: z.string().trim().max(2000, { message: 'At most 2000 characters' }),
  titleZh: z.string().trim().max(80, { message: 'At most 80 characters' }),
  categoryZh: z.string().trim().max(20, { message: 'At most 20 characters' }),
  promptZh: z.string().trim().max(2000, { message: 'At most 2000 characters' }),
  spec: z.string().trim().max(60, { message: 'At most 60 characters' }),
  video: mediaUrl,
  poster: mediaUrl,
  image: mediaUrl,
})

export const studioGalleryFormSchema = z.object({
  items: z.array(galleryItemSchema).max(STUDIO_GALLERY_MAX_ITEMS),
})

export type StudioGalleryFormValues = z.infer<typeof studioGalleryFormSchema>
