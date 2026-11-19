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
 * Longest prompt the studio accepts for any model, in Unicode characters.
 * The gateway rejects longer task prompts with the same number
 * (MaxTaskPromptLength in relay/common/relay_utils.go).
 */
export const STUDIO_PROMPT_MAX_LENGTH = 5000

/**
 * Longest text the prompt box keeps. It is above every model limit so a
 * pasted prompt stays whole and the counter shows how much to cut, instead
 * of the box dropping the end silently.
 */
export const PROMPT_INPUT_CAP = 20000

/** Prompt length as the gateway counts it: Unicode characters, trimmed. */
export function promptLength(prompt: string): number {
  return [...prompt.trim()].length
}

/** Problem shown when the prompt is over the model's limit; {{max}} is it. */
export const PROMPT_TOO_LONG =
  'The prompt is too long. Shorten it to {{max}} characters or fewer.'

export interface PromptGuide {
  /** Longest prompt the selected model accepts. */
  maxLength: number
  /**
   * i18n key of the model's prompt advice shown under the prompt box, next
   * to the character counter; {{max}} is filled with maxLength. Models with
   * nothing to add beyond the counter have none.
   */
  hint?: string
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
      hint: 'Seedance works best with up to 500 Chinese characters or 1,000 English words.',
    }
  }
  if (name.includes('wan')) {
    return {
      maxLength: STUDIO_PROMPT_MAX_LENGTH,
      hint: 'Wan handles long, detailed prompts.',
    }
  }
  return { maxLength: STUDIO_PROMPT_MAX_LENGTH }
}

/**
 * ids of the advice and character counter under a studio prompt box, which
 * the box names in aria-describedby; hintId is their shared prefix.
 */
export function composerHintIds(hintId: string): string {
  return `${hintId}-advice ${hintId}-count`
}
