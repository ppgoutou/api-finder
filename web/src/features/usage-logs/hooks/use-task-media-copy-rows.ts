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
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestampToDate } from '@/lib/format'

import type { TaskMediaCopyInfo } from '../types'

const STORAGE_TARGETS = [
  { key: 'overseas', label: 'Overseas storage' },
  { key: 'mainland', label: 'Mainland China storage' },
] as const

type Row = { label: string; value: string }

/**
 * Rows describing how the task's video was copied into media storage: the
 * outcome, the file size and how long the upstream download and each upload
 * took. Rendered inside the admin-only part of the task details.
 */
export function useTaskMediaCopyRows(info?: TaskMediaCopyInfo): Row[] {
  const { t, i18n } = useTranslation()
  if (!info) return []
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const seconds = (ms: number) =>
    t('{{value}} s', { value: formatNumber(ms / 1000, locale) })

  let status = t('Retrying, attempt {{count}}', { count: info.attempts ?? 0 })
  if (info.stored) status = t('Stored')
  else if (info.gave_up) status = t('Gave up')

  const rows: Row[] = [{ label: t('Copy status'), value: status }]
  if (info.size) {
    rows.push({
      label: t('File size'),
      value: t('{{value}} MB', {
        value: formatNumber(info.size / 1024 / 1024, locale),
      }),
    })
  }
  if (info.download_ms != null) {
    rows.push({
      label: t('Upstream download'),
      value: seconds(info.download_ms),
    })
  }
  for (const target of STORAGE_TARGETS) {
    const ms = info.upload_ms?.[target.key]
    if (ms != null) rows.push({ label: t(target.label), value: seconds(ms) })
  }
  if (info.stored_at) {
    rows.push({
      label: t('Stored at'),
      value: formatTimestampToDate(info.stored_at, 'seconds'),
    })
  }
  return rows
}
