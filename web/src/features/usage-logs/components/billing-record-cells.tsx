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

import { cn } from '@/lib/utils'

import type { UsageLog } from '../data/schema'
import { getBillingAmount, getBillingDescription } from '../lib/billing-record'
import { parseLogOther } from '../lib/format'
import { useUsageLogsContext } from './usage-logs-provider'

/** A record's signed amount, in green when it adds to the balance. */
export function BillingRecordAmount(props: { log: UsageLog }) {
  const { sensitiveVisible } = useUsageLogsContext()
  const amount = getBillingAmount(props.log, parseLogOther(props.log.other))
  if (!amount) return <span className='text-muted-foreground/40'>—</span>
  return (
    <span
      className={cn(
        'font-mono text-xs font-medium whitespace-nowrap tabular-nums',
        amount.startsWith('+') && 'text-emerald-600 dark:text-emerald-400'
      )}
    >
      {sensitiveVisible ? amount : '••••'}
    </span>
  )
}

export function BillingUserCell(props: { username: string }) {
  const { sensitiveVisible } = useUsageLogsContext()
  return (
    <span className='truncate text-xs'>
      {sensitiveVisible ? props.username : '••••'}
    </span>
  )
}

export function BillingNoteCell(props: { log: UsageLog }) {
  const { t } = useTranslation()
  const text = getBillingDescription(
    props.log,
    parseLogOther(props.log.other),
    t
  )
  if (!text) return <span className='text-muted-foreground/40'>—</span>
  return (
    <span className='block truncate text-xs' title={text}>
      {text}
    </span>
  )
}
