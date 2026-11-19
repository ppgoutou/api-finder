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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { toSentenceCase } from '../sentence-case.mjs'

describe('toSentenceCase', () => {
  it.each([
    ['Request Count', 'Request count'],
    ['Sign In With Passkey', 'Sign in with passkey'],
    ['5-Hour Window', '5-hour window'],
    ['(Optional) Display Name', '(Optional) display name'],
    ['Create API Key', 'Create API key'],
    ['Bind Telegram Account', 'Bind Telegram account'],
    ['Enable Waffo Pancake', 'Enable Waffo Pancake'],
    ['OpenAI Chat to Anthropic Messages', 'OpenAI Chat to Anthropic Messages'],
    ['Add Uptime Kuma Group', 'Add Uptime Kuma group'],
    ['Header Passthrough (X-Request-Id)', 'Header passthrough (X-Request-Id)'],
    ['Click "Generate" To Start', 'Click "Generate" to start'],
    ['Saved. Reload The Page', 'Saved. Reload the page'],
  ])('rewrites %j as %j', (value, expected) => {
    expect(toSentenceCase(value)).toBe(expected)
  })

  it.each([
    ['a single word', 'Settings'],
    ['an already sentence-case label', 'Request count'],
    ['a fixed name', 'Lavender Dream'],
    ['a value with a placeholder', 'Top Up {{amount}} Now'],
    [
      'a long sentence',
      'Videos And Images You Create Are Kept For Fifteen Days',
    ],
  ])('keeps %s unchanged', (_label, value) => {
    expect(toSentenceCase(value)).toBe(value)
  })
})

describe('en.json', () => {
  it('has no Title Case values left when the check runs', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts/sentence-case.mjs')],
      { cwd: root, encoding: 'utf8' }
    )
    expect(result.stdout).toContain('en.json is clean')
    expect(result.status).toBe(0)
  })
})
