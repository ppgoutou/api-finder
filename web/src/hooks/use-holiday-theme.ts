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
import dayjs from '@/lib/dayjs'
import {
  activeHolidayTheme,
  type HolidayThemeName,
  parseHolidayTheme,
} from '@/lib/holiday-theme'

import { useStatus } from './use-status'

/**
 * The seasonal look the site wears today, by the visitor's own date, or null
 * outside the dates set in System settings → Site → Holiday theme.
 */
export function useHolidayTheme(): HolidayThemeName | null {
  const { status } = useStatus()
  const settings = parseHolidayTheme(status?.holiday_theme)
  return activeHolidayTheme(settings, dayjs().format('YYYY-MM-DD'))
}
