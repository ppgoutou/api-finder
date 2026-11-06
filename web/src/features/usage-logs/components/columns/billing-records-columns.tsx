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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import { formatTimestampToDate } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { UsageLog } from '../../data/schema'
import { getBillingTypeLabel } from '../../lib/billing-record'
import { getLogTypeConfig } from '../../lib/utils'
import {
  BillingNoteCell,
  BillingRecordAmount,
  BillingUserCell,
} from '../billing-record-cells'

export function useBillingRecordsColumns(
  isAdmin: boolean
): ColumnDef<UsageLog>[] {
  const { t } = useTranslation()
  const currency = useSystemConfigStore((state) => state.config.currency)
  return useMemo(() => {
    const userColumns: ColumnDef<UsageLog>[] = isAdmin
      ? [
          {
            accessorKey: 'username',
            header: t('User'),
            cell: ({ row }) => (
              <BillingUserCell username={row.original.username ?? ''} />
            ),
            enableSorting: false,
            size: 140,
          },
        ]
      : []
    return [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) => (
          <span className='font-mono text-xs tabular-nums'>
            {formatTimestampToDate(row.original.created_at)}
          </span>
        ),
        enableHiding: false,
        enableSorting: false,
        size: 170,
      },
      {
        id: 'billing_type',
        header: t('Type'),
        accessorFn: (row) => row.type,
        cell: ({ row }) => (
          <StatusBadge
            label={t(getBillingTypeLabel(row.original.type))}
            variant={
              getLogTypeConfig(row.original.type)
                .color as StatusBadgeProps['variant']
            }
            size='sm'
            copyable={false}
            className='-ml-1.5 !text-xs [&_span]:!text-xs'
          />
        ),
        enableSorting: false,
        size: 90,
      },
      ...userColumns,
      {
        id: 'billing_amount',
        header: t('Amount'),
        accessorFn: (row) => row.quota,
        cell: ({ row }) => <BillingRecordAmount log={row.original} />,
        enableSorting: false,
        size: 130,
      },
      {
        id: 'billing_note',
        header: t('Billing Note'),
        accessorFn: (row) => row.content,
        cell: ({ row }) => <BillingNoteCell log={row.original} />,
        enableSorting: false,
        size: 480,
      },
    ]
    // Amounts read currency settings from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, isAdmin, currency])
}
