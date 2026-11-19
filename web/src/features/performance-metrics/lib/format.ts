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
import { getThemeColor } from '@/lib/chart-theme'
export function formatThroughput(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return '—'
  if (tps >= 1_000) return `${(tps / 1_000).toFixed(1)}K t/s`
  return `${tps.toFixed(tps < 10 ? 2 : 1)} t/s`
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

export function formatUptimePct(pct: number): string {
  if (!Number.isFinite(pct)) return '—'
  return `${pct.toFixed(2)}%`
}

export type SuccessRateLevel =
  | 'excellent'
  | 'good'
  | 'warning'
  | 'critical'
  | 'unknown'

const SUCCESS_RATE_EXCELLENT_MIN = 100
const SUCCESS_RATE_GOOD_MIN = 90
const SUCCESS_RATE_WARNING_MIN = 70

/**
 * Single source of truth for grading a success rate (0-100).
 * - excellent: 100% (full green)
 * - good: >= 90% (slightly lighter green)
 * - warning: >= 70%
 * - critical: below 70%
 * - unknown: non-finite values
 */
export function getSuccessRateLevel(rate: number): SuccessRateLevel {
  if (!Number.isFinite(rate)) return 'unknown'
  if (rate >= SUCCESS_RATE_EXCELLENT_MIN) return 'excellent'
  if (rate >= SUCCESS_RATE_GOOD_MIN) return 'good'
  if (rate >= SUCCESS_RATE_WARNING_MIN) return 'warning'
  return 'critical'
}

const SUCCESS_RATE_TEXT_CLASS: Record<SuccessRateLevel, string> = {
  excellent: 'text-success',
  good: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive',
  unknown: 'text-muted-foreground',
}

const SUCCESS_RATE_DOT_CLASS: Record<SuccessRateLevel, string> = {
  excellent: 'bg-success',
  good: 'bg-success/70',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  unknown: 'bg-muted-foreground',
}

// Theme colours for non-CSS contexts (chart libraries need raw values); the
// fallbacks apply where the theme cannot be read.
const SUCCESS_RATE_CHART_COLOR: Record<
  SuccessRateLevel,
  { token: string; fallback: string }
> = {
  excellent: { token: '--success', fallback: '#047857' },
  good: { token: '--success', fallback: '#047857' },
  warning: { token: '--warning', fallback: '#a16207' },
  critical: { token: '--destructive', fallback: '#dc2626' },
  unknown: { token: '--muted-foreground', fallback: '#9ca3af' },
}

export function getSuccessRateTextClass(rate: number): string {
  return SUCCESS_RATE_TEXT_CLASS[getSuccessRateLevel(rate)]
}

export function getSuccessRateDotClass(rate: number): string {
  return SUCCESS_RATE_DOT_CLASS[getSuccessRateLevel(rate)]
}

export function getSuccessRateColor(rate: number): string {
  const color = SUCCESS_RATE_CHART_COLOR[getSuccessRateLevel(rate)]
  return getThemeColor(color.token, color.fallback)
}
