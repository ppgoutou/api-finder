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
import { useTranslation } from 'react-i18next'

import {
  getHomeMediaUrl,
  SHOWCASE_CATEGORY_LABELS,
  SHOWCASE_VIDEOS,
} from '../lib/video-home'
import { useHomeShowcase } from './use-home-showcase'

export type ShowcaseCard = {
  key: string
  title: string
  category: string
  prompt: string
  spec: string
  video: string
  poster: string
}

/**
 * The home example clips: admin clips replace the built-in examples as a
 * whole.
 */
export function useShowcaseCards(): ShowcaseCard[] {
  const { t } = useTranslation()
  const configured = useHomeShowcase().showcase.filter((item) => item.video)
  if (configured.length > 0) {
    return configured.map((item, index) => ({
      key: `${index}:${item.video}`,
      title: item.title,
      category: item.category,
      prompt: item.prompt,
      spec: item.spec,
      video: item.video,
      poster: item.poster,
    }))
  }
  return SHOWCASE_VIDEOS.map((video) => ({
    key: video.name,
    title: t(video.title),
    category: t(SHOWCASE_CATEGORY_LABELS[video.category]),
    prompt: t(video.prompt),
    spec: video.spec,
    video: getHomeMediaUrl(`${video.name}.mp4`),
    poster: getHomeMediaUrl(`${video.name}.jpg`),
  }))
}
