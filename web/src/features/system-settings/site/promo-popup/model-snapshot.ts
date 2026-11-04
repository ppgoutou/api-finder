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
import type { PricingModel } from '@/features/pricing/types'
import { selectLanguageBlock } from '@/lib/language-blocks'

/** Longest description a card stores (controller/promo_popup.go). */
const MAX_DESCRIPTION_LENGTH = 160

function shortenDescription(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_DESCRIPTION_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`
}

/** The model's description in English and Chinese, short enough for a card. */
export function getPromoModelDescriptions(model: PricingModel) {
  const description = model.description_blocks ?? model.description ?? ''
  return {
    description: shortenDescription(selectLanguageBlock(description, 'en')),
    descriptionZh: shortenDescription(selectLanguageBlock(description, 'zh')),
  }
}
