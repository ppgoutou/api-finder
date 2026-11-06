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

import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import { formatTimestampToDate } from '@/lib/format'

import type { UsageLog } from '../data/schema'
import {
  getBillingDescription,
  getBillingTypeLabel,
} from '../lib/billing-record'
import { parseLogOther } from '../lib/format'
import { getLogTypeConfig } from '../lib/utils'
import { BillingRecordAmount } from './billing-record-cells'

export function BillingRecordMobileCard(props: { log: UsageLog }) {
  const { t } = useTranslation()
  const description = getBillingDescription(
    props.log,
    parseLogOther(props.log.other),
    t
  )
  return (
    <div className='min-w-0 space-y-2'>
      <div className='flex items-center justify-between gap-3'>
        <StatusBadge
          label={t(getBillingTypeLabel(props.log.type))}
          variant={
            getLogTypeConfig(props.log.type)
              .color as StatusBadgeProps['variant']
          }
          size='sm'
          copyable={false}
        />
        <BillingRecordAmount log={props.log} />
      </div>
      <p className='text-xs break-words'>{description || '—'}</p>
      <p className='text-muted-foreground font-mono text-xs tabular-nums'>
        {formatTimestampToDate(props.log.created_at)}
      </p>
    </div>
  )
}
