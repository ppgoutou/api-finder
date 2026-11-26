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
import type { StudioHandoff } from '@/stores/studio-handoff-store'

import { STUDIO_RATIOS } from '../constants'
import { parseGallerySpec } from './gallery-draft'

/**
 * A shown prompt, with its spec line such as "seedance 2.0 · 16:9 · 720p ·
 * 5s", as a work for the creation page. The page fits the model and settings
 * to what is available.
 */
export function handoffFromPrompt(prompt: string, spec = ''): StudioHandoff {
  const parsed = parseGallerySpec(spec)
  return {
    kind: 'video',
    draft: {
      prompt,
      mode: 'text',
      references: [],
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.ratio && STUDIO_RATIOS.includes(parsed.ratio)
        ? { ratio: parsed.ratio }
        : {}),
      ...(parsed.resolution ? { resolution: parsed.resolution } : {}),
      ...(parsed.seconds === undefined ? {} : { seconds: parsed.seconds }),
    },
  }
}
