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
import { describe, expect, test } from 'vitest'

import { buildApiParams } from '../utils'

function typeParams(
  logCategory: 'common' | 'billing',
  isAdmin: boolean,
  type?: string[]
) {
  const params = buildApiParams({
    page: 1,
    pageSize: 10,
    searchParams: type ? { type } : {},
    isAdmin,
    logCategory,
  })
  return { type: params.type, types: params.types }
}

describe('log type scope of a search', () => {
  test('all types on a regular user usage log leaves out money and retired types', () => {
    expect(typeParams('common', false, ['0'])).toEqual({
      type: undefined,
      types: '2,5,6',
    })
    expect(typeParams('common', false)).toEqual({
      type: undefined,
      types: '2,5,6',
    })
  })

  test('all types on billing records covers balance changes for every role', () => {
    for (const isAdmin of [false, true]) {
      expect(typeParams('billing', isAdmin, ['0'])).toEqual({
        type: undefined,
        types: '1,2,6,4',
      })
    }
  })

  test('a type the page lists is searched alone', () => {
    expect(typeParams('common', false, ['5'])).toEqual({
      type: 5,
      types: undefined,
    })
    expect(typeParams('billing', false, ['1'])).toEqual({
      type: 1,
      types: undefined,
    })
  })

  test('a type the page does not list falls back to the page scope', () => {
    expect(typeParams('common', false, ['3']).types).toBe('2,5,6')
    expect(typeParams('billing', false, ['5']).types).toBe('1,2,6,4')
  })

  test('administrators viewing all usage logs keep every type', () => {
    expect(typeParams('common', true, ['0'])).toEqual({
      type: 0,
      types: undefined,
    })
    expect(typeParams('common', true, ['3'])).toEqual({
      type: 3,
      types: undefined,
    })
  })
})
