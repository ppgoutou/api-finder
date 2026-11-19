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
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// [file name, source, rule expected to fire or null]
const cases = [
  ['px-size', "const c = 'text-[13px] font-medium'", 'no-arbitrary-font-size'],
  [
    'rem-variant-size',
    "const c = 'sm:text-[0.8rem]'",
    'no-arbitrary-font-size',
  ],
  [
    'template-size',
    'const c = `flex ${"x"} text-[11px]`',
    'no-arbitrary-font-size',
  ],
  ['em-size', "const c = 'font-mono text-[0.9em]'", null],
  ['inherit-size', "const c = 'text-[length:inherit]'", null],
  ['scale-size', "const c = 'text-caption sm:text-body-sm'", null],
  ['palette-text', "const c = 'text-amber-500'", 'no-raw-palette-color'],
  [
    'palette-variant-opacity',
    "const c = 'dark:hover:bg-emerald-400/20'",
    'no-raw-palette-color',
  ],
  [
    'palette-side-border',
    "const c = 'border-l-rose-600'",
    'no-raw-palette-color',
  ],
  [
    'arbitrary-hex',
    "const c = 'bg-[#229ED9] text-white'",
    'no-raw-palette-color',
  ],
  ['theme-colors', "const c = 'bg-vip text-success border-warning/40'", null],
  ['white-black', "const c = 'bg-white text-black/60'", null],
  ['copy-mentions-color', "const s = 'Choose gray or blue'", null],
  ['canvas-hex', "const fallback = { stroke: '#000', fill: '#10a37f' }", null],
  [
    'raw-button',
    "export const A = () => <button type='button'>x</button>",
    'no-raw-button',
  ],
  [
    'button-component',
    "import { Button } from '@/components/ui/button'\nexport const A = () => <Button type='button'>x</Button>",
    null,
  ],
  [
    'disabled-with-reason',
    "export const A = () => (\n  // oxlint-disable-next-line design/no-raw-button -- spinner step\n  <button type='button'>x</button>\n)",
    null,
  ],
] as const

type Diagnostic = { filename: string; code: string; severity: string }

let directory: string
let diagnostics: Diagnostic[]

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'new-api-design-lint-'))
  for (const [name, code] of cases) {
    writeFileSync(join(directory, `${name}.tsx`), code)
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/oxlint/bin/oxlint'),
      '-c',
      join(root, '.oxlintrc.design.json'),
      '--format',
      'json',
      directory,
    ],
    { cwd: root, encoding: 'utf8' }
  )
  expect(result.error).toBeUndefined()
  expect([0, 1], result.stderr).toContain(result.status)
  diagnostics = JSON.parse(result.stdout).diagnostics
})

afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('design guideline lint rules', () => {
  it.each(cases)('%s matches the expected lint result', (name, _code, rule) => {
    const errors = diagnostics.filter(
      (item) =>
        basename(item.filename) === `${name}.tsx` && item.severity === 'error'
    )
    if (rule) {
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toContain(rule)
    } else {
      expect(errors).toEqual([])
    }
  })
})
