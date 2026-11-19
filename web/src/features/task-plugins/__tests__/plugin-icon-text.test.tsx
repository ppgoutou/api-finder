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
import { describe, expect, test } from 'vitest'

import { PluginIcon } from '../components/plugin-icon'

function renderTextIcon(size: number, name: string) {
  const view = render(
    <PluginIcon plugin={{ key: 'example', name }} size={size} />
  )
  return view.container.firstElementChild as HTMLElement
}

describe('text plugin icon', () => {
  test('a 20px tile keeps two letters at the 11px type floor', () => {
    const icon = renderTextIcon(20, 'PX Show')

    expect(icon).toHaveTextContent(/^PX$/)
    expect(icon.style.fontSize).toBe('11px')
  })

  test('a 20px tile shows only the first CJK character', () => {
    const icon = renderTextIcon(20, '妖火')

    expect(icon).toHaveTextContent(/^妖$/)
  })

  test('a 40px tile shows both letters scaled with the tile', () => {
    const icon = renderTextIcon(40, 'PX Show')

    expect(icon).toHaveTextContent(/^PX$/)
    expect(icon.style.fontSize).toBe('16px')
  })
})
