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

// English UI copy uses sentence case: only the first word and proper nouns
// start with a capital ("Request count", "Sign in with passkey").
//
//   node scripts/sentence-case.mjs        list Title Case values in en.json
//   node scripts/sentence-case.mjs --fix  rewrite those values in place
//
// Only the English values change; the keys (the English source strings in
// code) and the other locale files stay as they are. The file is edited line
// by line, never through JSON.parse + JSON.stringify, so escaped keys keep
// their exact spelling. Proper nouns and fixed names live in
// sentence-case-exceptions.json.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const exceptions = JSON.parse(
  fs.readFileSync(path.join(here, 'sentence-case-exceptions.json'), 'utf8')
)
const properWords = new Set(exceptions.words)
const keptValues = new Set(exceptions.values)
// Longest first, so "OpenAI Chat Completions" wins over "OpenAI Chat".
const keptPhrases = [...exceptions.phrases].sort((a, b) => b.length - a.length)

// Short labels, buttons and headings; longer text is prose and is left to
// review.
const MAX_WORDS = 6
const MAX_LENGTH = 60
const capitalisedWord = /^[A-Z][a-z]+(?:['’][a-z]+)?$/

export function toSentenceCase(value) {
  if (typeof value !== 'string') return value
  if (keptValues.has(value)) return value
  if (value.length > MAX_LENGTH || /\{\{|<|\n|https?:/.test(value)) return value
  const words = value.trim().split(/\s+/)
  if (words.length < 2 || words.length > MAX_WORDS) return value

  // Mask kept phrases so their words are not touched.
  const masked = []
  let text = value
  for (const phrase of keptPhrases) {
    const at = text.indexOf(phrase)
    if (at === -1) continue
    text = text.split(phrase).join(`\uE000${masked.length}\uE000`)
    masked.push(phrase)
  }

  let seenFirstWord = false
  text = text.replaceAll(
    /\uE000\d+\uE000|[A-Za-z][A-Za-z'’]*/g,
    (token, offset) => {
      if (token.startsWith('\uE000')) {
        seenFirstWord = true
        return token
      }
      // The first word is the first one with no letter or digit before it,
      // so "(Optional) name" keeps "Optional" and "5-Hour" becomes "5-hour".
      const isFirst =
        !seenFirstWord && !/[A-Za-z0-9]/.test(text.slice(0, offset))
      seenFirstWord = true
      if (isFirst) return token
      // A new sentence after ". " or "? ", and a quoted name such as
      // Click "Generate", keep their capital.
      const before = text.slice(Math.max(0, offset - 2), offset)
      if (/[.!?] $/.test(before) || /["“'‘]$/.test(before)) return token
      if (!capitalisedWord.test(token)) return token
      if (properWords.has(token)) return token
      return token.toLowerCase()
    }
  )
  return text.replaceAll(
    /\uE000(\d+)\uE000/g,
    (_, index) => masked[Number(index)]
  )
}

function main() {
  const fix = process.argv.includes('--fix')
  const file = path.resolve(here, '../src/i18n/locales/en.json')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  // `    "key": "value",` — one entry per line under "translation".
  const entry = /^(\s*"(?:[^"\\]|\\.)*":\s*)("(?:[^"\\]|\\.)*")(,?)$/
  const changes = []
  const out = lines.map((line, index) => {
    const match = line.match(entry)
    if (!match) return line
    const value = JSON.parse(match[2])
    const next = toSentenceCase(value)
    if (next === value) return line
    changes.push({ line: index + 1, value, next })
    return `${match[1]}${JSON.stringify(next)}${match[3]}`
  })

  if (fix) {
    fs.writeFileSync(file, out.join('\n'))
    // Validate only; the rewrite above never re-serialises the file.
    JSON.parse(out.join('\n'))
    console.log(`Sentence case: rewrote ${changes.length} values in en.json`)
    return
  }
  if (changes.length === 0) {
    console.log('Sentence case: en.json is clean')
    return
  }
  for (const change of changes) {
    console.log(
      `en.json:${change.line}  ${JSON.stringify(change.value)}  ->  ${JSON.stringify(change.next)}`
    )
  }
  console.log(
    `\n${changes.length} English values use Title Case. Run \`bun run i18n:sentence-case --fix\`, or add a proper noun to scripts/sentence-case-exceptions.json.`
  )
  process.exitCode = 1
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main()
}
