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
import { formatLogQuota } from '@/lib/format'
import { translateServerText } from '@/lib/server-error-message'

import { BONUS_LOG_TYPE_LABEL, LOG_TYPE_ENUM } from '../constants'
import type { UsageLog } from '../data/schema'
import type { LogOtherData } from '../types'
import {
  isViolationFeeLog,
  renderAuditContent,
  renderLogContent,
} from './format'
import {
  formatRecordedQuota,
  getTopupAmount,
  getTopupKind,
  getTopupMethodLabel,
  getTopupRemainingDetail,
} from './topup-log'
import { getLogTypeConfig } from './utils'

type Translate = (key: string, opts?: Record<string, unknown>) => string

/**
 * System logs that added their quota to the balance when they were written.
 * A pending or reversed invitation rebate did not, so it shows no amount.
 */
const CREDITED_BONUS_KEYS = new Set([
  'Daily check-in, received {{quota}}',
  'New user sign-up bonus {{quota}}',
  'Invitation code bonus {{quota}}',
  'Bonus for inviting a user {{quota}}',
  'Invitation rebate {{quota}} moved to balance',
])

function withPlusSign(amount: string | null): string | null {
  if (!amount) return null
  return amount.startsWith('-') ? amount : `+${amount}`
}

export function getBillingTypeLabel(type: number): string {
  return type === LOG_TYPE_ENUM.SYSTEM
    ? BONUS_LOG_TYPE_LABEL
    : getLogTypeConfig(type).label
}

/**
 * The signed balance change of a record, or null when the log does not state
 * one, such as a subscription purchase, whose text stays in the note.
 */
export function getBillingAmount(
  log: Pick<UsageLog, 'type' | 'quota'>,
  other: LogOtherData | null
): string | null {
  const quota = log.quota ?? 0
  switch (log.type) {
    case LOG_TYPE_ENUM.CONSUME:
      return quota > 0 ? `-${formatLogQuota(quota)}` : formatLogQuota(quota)
    case LOG_TYPE_ENUM.REFUND:
      return withPlusSign(formatLogQuota(quota))
    case LOG_TYPE_ENUM.TOPUP:
      return withPlusSign(getTopupAmount(other))
    case LOG_TYPE_ENUM.SYSTEM: {
      const part = other?.content_parts?.[0]
      return part && CREDITED_BONUS_KEYS.has(part.key)
        ? withPlusSign(formatRecordedQuota(part.params?.quota))
        : null
    }
    default:
      return null
  }
}

/** What a record was for: the model charged, the top-up method, or the log text. */
export function getBillingDescription(
  log: Pick<UsageLog, 'type' | 'model_name' | 'content'>,
  other: LogOtherData | null,
  t: Translate
): string {
  const logText = renderLogContent(other, t) ?? log.content ?? ''
  switch (log.type) {
    case LOG_TYPE_ENUM.CONSUME:
      return isViolationFeeLog(other)
        ? t('Violation Fee')
        : log.model_name || logText
    case LOG_TYPE_ENUM.REFUND:
      return [
        log.model_name,
        other?.reason
          ? translateServerText(t, other.reason)
          : t('Async task refund'),
      ]
        .filter(Boolean)
        .join(' · ')
    case LOG_TYPE_ENUM.TOPUP: {
      const kind = getTopupKind(other)
      if (!kind) return renderAuditContent(other, t) ?? logText
      return [getTopupMethodLabel(kind, t), getTopupRemainingDetail(other, t)]
        .filter(Boolean)
        .join(' · ')
    }
    default:
      return logText
  }
}
