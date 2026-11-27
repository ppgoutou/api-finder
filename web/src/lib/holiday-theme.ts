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

/** The site option that holds the seasonal look. */
export const HOLIDAY_THEME_OPTION_KEY = 'HolidayTheme'

export type HolidayThemeName = 'christmas'

/**
 * A seasonal look the site wears from `start` to `end`, both inclusive
 * (`YYYY-MM-DD`). An empty `theme` turns it off.
 */
export type HolidayThemeSettings = {
  theme: HolidayThemeName | ''
  start: string
  end: string
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const EMPTY_HOLIDAY_THEME: HolidayThemeSettings = {
  theme: '',
  start: '',
  end: '',
}

/** Read the stored option; anything unreadable counts as off. */
export function parseHolidayTheme(raw: unknown): HolidayThemeSettings {
  if (typeof raw !== 'string' || raw.trim() === '') return EMPTY_HOLIDAY_THEME
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return EMPTY_HOLIDAY_THEME
  }
  if (!value || typeof value !== 'object') return EMPTY_HOLIDAY_THEME
  const record = value as Record<string, unknown>
  const start = typeof record.start === 'string' ? record.start : ''
  const end = typeof record.end === 'string' ? record.end : ''
  return {
    theme: record.theme === 'christmas' ? 'christmas' : '',
    start,
    end,
  }
}

export function serializeHolidayTheme(settings: HolidayThemeSettings): string {
  if (settings.theme === '') return ''
  return JSON.stringify(settings)
}

/** The theme to show on `today` (`YYYY-MM-DD`, the visitor's own date). */
export function activeHolidayTheme(
  settings: HolidayThemeSettings,
  today: string
): HolidayThemeName | null {
  if (settings.theme === '') return null
  if (!DAY_PATTERN.test(settings.start) || !DAY_PATTERN.test(settings.end)) {
    return null
  }
  if (today < settings.start || today > settings.end) return null
  return settings.theme
}
