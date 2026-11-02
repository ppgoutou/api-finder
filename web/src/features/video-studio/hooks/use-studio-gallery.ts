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
import { useTranslation } from 'react-i18next'

import { getStudioGallery } from '../api'
import {
  localizeStudioGalleryItem,
  parseStudioGallery,
} from '../lib/studio-gallery'

export const STUDIO_GALLERY_QUERY_KEY = ['studio-gallery'] as const

/**
 * Video-studio gallery clips from the admin, localized for the interface
 * language. Empty while loading or when nothing is configured.
 */
export function useStudioGallery() {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const { data } = useQuery({
    queryKey: STUDIO_GALLERY_QUERY_KEY,
    queryFn: getStudioGallery,
    staleTime: 60 * 1000,
    meta: { errorToast: false },
  })
  const settings = parseStudioGallery(data?.success ? data.data : '')
  return {
    items: settings.items.map((item) =>
      localizeStudioGalleryItem(item, language)
    ),
  }
}
