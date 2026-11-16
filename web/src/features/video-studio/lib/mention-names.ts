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
