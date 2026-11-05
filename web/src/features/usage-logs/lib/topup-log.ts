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

import type { LogOtherData } from '../types'
import { buildQuotaAuditOperation } from './quota-audit-operation'
import { isDisplayableLogType } from './utils'

type Translate = (key: string, opts?: Record<string, unknown>) => string

/**
 * - `default`: every column.
 * - `no-usage`: the selected log types never fill the usage columns.
 * - `topup`: only top-up logs are selected, so they also get their own columns.
 */
export type LogColumnMode = 'default' | 'no-usage' | 'topup'

export type TopupKind =
  | 'online'
  | 'redemption'
  | 'admin_add'
  | 'admin_subtract'
  | 'admin_override'

const TOPUP_LOG_TYPE = '1'
const ADMIN_COMPLETED_KEY =
  'Administrator completed the order, amount added: {{quota}}, payment amount: {{amount}}'
const ONLINE_KEYS = new Set([
  'Online top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}',
  '{{provider}} top-up succeeded, amount added: {{quota}}, payment amount: {{amount}}',
  ADMIN_COMPLETED_KEY,
])
const REDEMPTION_KEY =
  'Topped up {{quota}} with a redemption code, code ID {{id}}'
const ADMIN_KINDS: Record<string, TopupKind> = {
  'user.quota_add': 'admin_add',
  'user.quota_subtract': 'admin_subtract',
  'user.quota_override': 'admin_override',
}

export function getLogColumnMode(selectedTypes: unknown): LogColumnMode {
  if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
    return 'default'
  }
  const types = selectedTypes.map(String)
  if (types.some((type) => isDisplayableLogType(Number(type)))) return 'default'
  return types.length === 1 && types[0] === TOPUP_LOG_TYPE
    ? 'topup'
    : 'no-usage'
}

/**
 * Top-up logs not listed here, such as Stripe refunds and subscription
 * purchases, have no kind and keep their full text in the details column.
 */
export function getTopupKind(other: LogOtherData | null): TopupKind | null {
  const action = other?.op?.action
  if (action) return ADMIN_KINDS[action] ?? null
  const key = other?.content_parts?.[0]?.key
  if (!key) return null
  if (key === REDEMPTION_KEY) return 'redemption'
  return ONLINE_KEYS.has(key) ? 'online' : null
}

export function getTopupMethodLabel(kind: TopupKind, t: Translate): string {
  switch (kind) {
    case 'online':
      return t('Online Top-up')
    case 'redemption':
      return t('Redemption Code Top-up')
    case 'admin_add':
      return t('Administrator Quota Increase')
    case 'admin_subtract':
      return t('Administrator Quota Decrease')
    case 'admin_override':
      return t('Administrator Quota Override')
  }
}

function formatSignedQuota(quota: number): string {
  return quota < 0 ? `-${formatLogQuota(-quota)}` : formatLogQuota(quota)
}

/**
 * The gateway stores credited quota as text in the display currency of that
 * moment, such as `¥68.000000`, so it is only tidied and never converted.
 */
function formatRecordedQuota(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? formatLogQuota(value) : null
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  const match = /^([^\d.-]*)(\d+(?:\.\d+)?)$/.exec(text)
  if (!match) return text || null
  const symbol = match[1] === '＄' ? '$' : match[1]
  return `${symbol}${Number(match[2])}`
}

export function getTopupAmount(other: LogOtherData | null): string | null {
  const kind = getTopupKind(other)
  if (kind === 'online' || kind === 'redemption') {
    return formatRecordedQuota(other?.content_parts?.[0]?.params?.quota)
  }

  const params = other?.op?.params ?? {}
  if (kind === 'admin_override') {
    const { from, to } = params
    return typeof from === 'number' && typeof to === 'number'
      ? formatSignedQuota(to - from)
      : null
  }
  const requested = params.requested_quota ?? params.quota
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return null
  return formatSignedQuota(kind === 'admin_subtract' ? -requested : requested)
}

/**
 * What is left for the details column once the method and amount have their
 * own columns. Null means the full log text should stay there.
 */
export function getTopupRemainingDetail(
  other: LogOtherData | null,
  t: Translate
): string | null {
  const kind = getTopupKind(other)
  if (!kind) return null

  const part = other?.content_parts?.[0]
  if (kind === 'online') {
    if (part?.key === ADMIN_COMPLETED_KEY) return null
    const amount = part?.params?.amount
    if (amount === undefined || amount === '') return null
    const paid = Number(amount)
    return t('Payment amount: {{amount}}', {
      amount: Number.isFinite(paid) ? paid : amount,
    })
  }
  if (kind === 'redemption') {
    const id = part?.params?.id
    return id === undefined ? null : t('Redemption code ID: {{id}}', { id })
  }

  const operation = buildQuotaAuditOperation(
    other?.op?.action ?? '',
    other?.op?.params ?? {},
    other?.audit_info?.success !== false,
    t
  )
  return operation?.description ?? null
}
