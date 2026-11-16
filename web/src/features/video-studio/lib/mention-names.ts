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
import { normalizeInterfaceLanguage } from '@/i18n/languages'

import { MENTION_NAMES, REFERENCE_TOKEN_NAMES } from '../constants'
import type { AssetKind } from '../types'

const KINDS: AssetKind[] = ['image', 'video', 'audio']

/** Replaces every "@<name><n>" of one naming with the other naming. */
function renameMentions(
  text: string,
  from: Readonly<Record<AssetKind, string>>,
  to: Readonly<Record<AssetKind, string>>
): string {
  const kindByName = new Map(KINDS.map((kind) => [from[kind], kind]))
  const names = [...kindByName.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`@(${names.join('|')})(\\d+)`, 'g')
  return text.replace(pattern, (match, name: string, digits: string) => {
    const kind = kindByName.get(name)
    return kind ? `@${to[kind]}${digits}` : match
  })
}

function namesFor(language?: string | null) {
  return (
    MENTION_NAMES[normalizeInterfaceLanguage(language)] ?? REFERENCE_TOKEN_NAMES
  )
}

/** A prompt as the interface language shows it: "@图片1" reads "@Image1". */
export function localizeMentions(
  prompt: string,
  language?: string | null
): string {
  return renameMentions(prompt, REFERENCE_TOKEN_NAMES, namesFor(language))
}

/** The prompt the model reads from text typed in the interface language. */
export function canonicalMentions(
  text: string,
  language?: string | null
): string {
  return renameMentions(text, namesFor(language), REFERENCE_TOKEN_NAMES)
}

/** A run of prompt text, flagged when it is a mention of a known reference. */
export interface PromptPart {
  /** Offset of the run in the text. */
  start: number
  text: string
  mention: boolean
}

/**
 * Prompt text cut into plain runs and mentions such as "@Image1", where
 * mentions are the given names only; "@Image12" is not "@Image1".
 */
export function splitMentions(
  text: string,
  mentions: readonly string[]
): PromptPart[] {
  if (mentions.length === 0) return [{ start: 0, text, mention: false }]
  const escaped = [...mentions]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`@(?:${escaped.join('|')})(?!\\d)`, 'g')
  const parts: PromptPart[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) {
      parts.push({
        start: last,
        text: text.slice(last, match.index),
        mention: false,
      })
    }
    parts.push({ start: match.index, text: match[0], mention: true })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push({ start: last, text: text.slice(last), mention: false })
  }
  return parts
}
