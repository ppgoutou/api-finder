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
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ClipSpec } from '../components/clip-spec'

function renderedParts(spec: string): string[] {
  const { container } = render(<ClipSpec spec={spec} />)
  return [...(container.firstElementChild?.children ?? [])].map(
    (part) => part.textContent ?? ''
  )
}

describe('clip spec', () => {
  it('shows each dot-joined part as its own word without the dots', () => {
    expect(renderedParts('seedance 2.0 · 720P · 15s')).toEqual([
      'seedance 2.0',
      '720P',
      '15s',
    ])
  })

  it('keeps a spec without separators as one part', () => {
    expect(renderedParts('seedance 2.5')).toEqual(['seedance 2.5'])
  })

  it('drops empty parts left by stray separators', () => {
    expect(renderedParts(' · 1080P ·· 10s · ')).toEqual(['1080P', '10s'])
  })
})
