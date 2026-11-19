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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

/** One watched upstream channel, stored in balance_alert_setting.monitors. */
export interface BalanceAlertMonitor {
  channel_id: number
  path: string
  field: string
  threshold: number
  /** Upstream number ÷ divisor = balance in `unit`; 1 keeps it. */
  divisor: number
  unit: string
}

/** One monitor's result from "Check balances now". */
export interface BalanceCheckResult {
  channel_id: number
  channel_name: string
  balance?: number
  threshold: number
  unit: string
  raw?: string
  error?: string
}

/**
 * Reads the saved monitors option, which the options API returns as JSON
 * text. Anything unreadable becomes an empty list.
 */
export function parseBalanceAlertMonitors(
  value: unknown
): BalanceAlertMonitor[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value || '[]')
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null
    )
    .map((item) => ({
      channel_id: Number(item.channel_id) || 0,
      path: String(item.path ?? ''),
      field: String(item.field ?? ''),
      threshold: Number(item.threshold) || 0,
      divisor: Number(item.divisor) > 0 ? Number(item.divisor) : 1,
      unit: String(item.unit ?? ''),
    }))
}

export async function checkBalanceAlerts(): Promise<BalanceCheckResult[]> {
  const res = await api.post('/api/option/balance_alert/check')
  return requireServerSuccess(res.data).data ?? []
}

export async function sendBalanceAlertTest(): Promise<void> {
  const res = await api.post('/api/option/balance_alert/test')
  requireServerSuccess(res.data)
}
