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

/** Longest prompt the studio accepts for any model. */
export const STUDIO_PROMPT_MAX_LENGTH = 7500

export interface PromptGuide {
  /** Longest prompt the selected model accepts. */
  maxLength: number
  /**
   * i18n key of the length advice shown under the empty prompt box;
   * {{max}} is filled with maxLength.
   */
  hint: string
}

/**
 * Prompt length advice for a model, matched on its family name since the
 * catalog names carry supplier line prefixes ("C-seedance-2.0", "D-wan-3.0-P").
 */
export function promptGuide(modelName: string | undefined): PromptGuide {
  const name = (modelName ?? '').toLowerCase()
  // MiniMax rejects prompts longer than 2000 characters.
  if (name.includes('minimax') || name.includes('hailuo')) {
    return {
      maxLength: 2000,
      hint: 'MiniMax takes up to {{max}} characters.',
    }
  }
  // Seedance has no hard cap; the vendor advises short prompts so details
  // are not dropped.
  if (name.includes('seedance') || /(^|-)sd-?2/.test(name)) {
    return {
      maxLength: STUDIO_PROMPT_MAX_LENGTH,
      hint: 'Seedance works best with up to 500 Chinese characters or 1,000 English words (up to {{max}} characters).',
    }
  }
  if (name.includes('wan')) {
    return {
      maxLength: STUDIO_PROMPT_MAX_LENGTH,
      hint: 'Wan handles long, detailed prompts (up to {{max}} characters).',
    }
  }
  return {
    maxLength: STUDIO_PROMPT_MAX_LENGTH,
    hint: 'Up to {{max}} characters.',
  }
}
