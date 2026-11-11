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

/**
 * Public folder holding the home page videos and their posters
 * (`<name>.mp4` + `<name>.jpg`). Empty until the files are uploaded; the page
 * then shows placeholders instead of video.
 */
export const HOME_MEDIA_BASE_URL: string = ''

/** Official support channels; customers pick whichever suits them. */
export const SUPPORT_QQ = '3895235714'
export const SUPPORT_TELEGRAM = 'APIFinder_Support'

/**
 * Link that opens a QQ chat with support: the mobile QQ app on phones and
 * tablets, the desktop QQ client elsewhere.
 */
export function getSupportQqChatUrl(userAgent: string): string {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) {
    return `mqqwpa://im/chat?chat_type=wpa&uin=${SUPPORT_QQ}&version=1&src_type=web`
  }
  return `tencent://message/?uin=${SUPPORT_QQ}&Site=api-finder&Menu=yes`
}

/**
 * Seedance models presented on the home page, in display order. The
 * duration range stands in for the one the model's plugin declares while the
 * pricing list has no model of that exact name.
 */
export const HOME_VIDEO_MODELS = [
  {
    name: 'seedance-2.0',
    tagline: 'Stable and cost-effective, up to 4K',
    resolutions: ['480p', '720p', '1080p', '4K'],
    durationRange: [4, 15],
    isNew: false,
  },
  {
    name: 'seedance-2.5',
    tagline: 'More natural motion and longer clips',
    resolutions: ['480p', '720p', '1080p'],
    durationRange: [4, 30],
    isNew: true,
  },
] as const

export type ShowcaseCategory =
  | 'product'
  | 'anime'
  | 'camera'
  | 'fantasy'
  | 'food'

/** Category filter labels; values are i18n keys. */
export const SHOWCASE_CATEGORY_LABELS: Record<ShowcaseCategory, string> = {
  product: 'Product ads',
  anime: 'Anime',
  camera: 'Camera moves',
  fantasy: 'Fantasy',
  food: 'Food',
}

export type ShowcaseVideoItem = {
  /** Media file name without extension. */
  name: string
  category: ShowcaseCategory
  /** i18n key */
  title: string
  /** i18n key; the translated text is what the viewer copies. */
  prompt: string
  spec: string
}

const SUPERCAR_PROMPT =
  "On a rainy night track, a silver supercar slowly drives into frame. The wet asphalt reflects neon lights as a low-angle camera slowly pushes in, mist swirling through the headlight beams, ending on a close-up of the car's front. Cinematic, shallow depth of field."

export const HERO_VIDEO: ShowcaseVideoItem = {
  name: 'hero',
  category: 'product',
  title: 'Supercar in the rain',
  prompt: SUPERCAR_PROMPT,
  spec: 'seedance-2.0 · 1080p · 10s',
}

export const SHOWCASE_VIDEOS: ShowcaseVideoItem[] = [
  {
    name: 'g1-supercar',
    category: 'product',
    title: 'Supercar in the rain',
    prompt: SUPERCAR_PROMPT,
    spec: 'seedance-2.0 · 720p · 5s',
  },
  {
    name: 'g2-watch',
    category: 'product',
    title: 'Mechanical watch',
    prompt:
      'A stainless steel mechanical watch on a pure black background. Soft side light slowly sweeps across the dial; the camera orbits the case once and stops facing the front, the second hand ticking clearly. Premium commercial look, macro detail.',
    spec: 'seedance-2.0 · 720p · 5s',
  },
  {
    name: 'g3-anime',
    category: 'anime',
    title: 'Reading by the window',
    prompt:
      'Japanese anime style. A long-haired girl reads by the window as afternoon sun filters through white curtains and a breeze stirs the pages and her hair. The camera slowly pushes in. Delicate light and shadow, a calm atmosphere.',
    spec: 'seedance-2.0 · 720p · 5s',
  },
  {
    name: 'g4-parkour',
    category: 'camera',
    title: 'Rooftop parkour',
    prompt:
      'Tracking shot: a parkour runner sprints, vaults and leaps across city rooftops at dusk. The camera follows closely past railings and water tanks, then over the roof edge as the skyline opens up. Handheld energy.',
    spec: 'seedance-2.0 · 720p · 5s',
  },
  {
    name: 'g5-crystal',
    category: 'fantasy',
    title: 'Crystal cave',
    prompt:
      'A traveler carrying a lantern walks into a vast glowing crystal cave. Blue-violet crystals reflect on a still underground lake as the camera drifts slowly forward and tiny specks of light float in the air. An epic fantasy scene.',
    spec: 'seedance-2.0 · 720p · 5s',
  },
  {
    name: 'g6-ramen',
    category: 'food',
    title: 'A bowl of ramen',
    prompt:
      'Close-up of a steaming bowl of ramen. Chopsticks slowly lift the noodles, broth drips, and steam rises. Warm lighting, slow motion, food commercial look.',
    spec: 'seedance-2.0 · 720p · 5s',
  },
]

export const IMAGE_TO_VIDEO_OUTPUT = 'i2v-output'
export const IMAGE_TO_VIDEO_INPUT_IMAGE = 'i2v-input.jpg'

/** Absolute URL of a home media file, or '' while no media host is set. */
export function getHomeMediaUrl(fileName: string): string {
  if (!HOME_MEDIA_BASE_URL) return ''
  return `${HOME_MEDIA_BASE_URL.replace(/\/+$/, '')}/${fileName}`
}

export type PriceDiscount = {
  /** Percent off the official price, e.g. 25 for a 0.75 ratio. */
  percentOff: number
  /** Chinese "折" value, e.g. "7.5" for a 0.75 ratio. */
  zhe: string
}

/**
 * Discount shown on the home page for a ratio of our price to the official
 * price below 1, or null when the ratio does not discount the official price.
 */
export function getPriceDiscount(ratio: number): PriceDiscount | null {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return null
  const percentOff = Math.round((1 - ratio) * 100)
  if (percentOff <= 0) return null
  return {
    percentOff,
    zhe: String(Math.round(ratio * 100) / 10),
  }
}
