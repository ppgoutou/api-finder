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
import { describe, expect, it } from 'vitest'

import {
  activeHolidayTheme,
  EMPTY_HOLIDAY_THEME,
  parseHolidayTheme,
  serializeHolidayTheme,
} from '../holiday-theme'

const CHRISTMAS = JSON.stringify({
  theme: 'christmas',
  start: '2026-12-15',
  end: '2027-01-02',
})

describe('activeHolidayTheme', () => {
  it.each([
    ['the first day', '2026-12-15', 'christmas'],
    ['a day across the new year', '2027-01-01', 'christmas'],
    ['the last day', '2027-01-02', 'christmas'],
    ['the day before the first day', '2026-12-14', null],
    ['the day after the last day', '2027-01-03', null],
  ])(
    'returns the theme only inside the dates on %s',
    (_label, today, theme) => {
      expect(activeHolidayTheme(parseHolidayTheme(CHRISTMAS), today)).toBe(
        theme
      )
    }
  )

  it('stays off when the stored dates are missing', () => {
    const settings = parseHolidayTheme('{"theme":"christmas","start":""}')
    expect(activeHolidayTheme(settings, '2026-12-25')).toBeNull()
  })
})

describe('parseHolidayTheme', () => {
  it.each([
    ['an empty option', ''],
    ['broken JSON', '{"theme":'],
    ['a value that is not a string', undefined],
  ])('treats %s as off', (_label, raw) => {
    expect(parseHolidayTheme(raw)).toEqual(EMPTY_HOLIDAY_THEME)
  })

  it('drops a theme the site does not know', () => {
    expect(
      parseHolidayTheme(
        '{"theme":"halloween","start":"2026-10-25","end":"2026-10-31"}'
      ).theme
    ).toBe('')
  })
})

describe('serializeHolidayTheme', () => {
  it('stores an empty option when the theme is off', () => {
    expect(
      serializeHolidayTheme({ theme: '', start: '2026-12-15', end: '' })
    ).toBe('')
  })

  it('round-trips a Christmas theme', () => {
    expect(
      parseHolidayTheme(serializeHolidayTheme(parseHolidayTheme(CHRISTMAS)))
    ).toEqual(parseHolidayTheme(CHRISTMAS))
  })
})
