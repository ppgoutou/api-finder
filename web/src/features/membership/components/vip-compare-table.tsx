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
import { CrownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { cn } from '@/lib/utils'

import { getVipBenefits, getVipUpgradeRule } from '../lib/benefits'
import { VIP_GOLD_TEXT } from '../lib/vip-style'
import type { MembershipInfo } from '../types'

interface CompareRow {
  id: string
  label: string
  standard: string
  vip: string
}

interface VipCompareTableProps {
  info: MembershipInfo
  className?: string
}

/** Standard and VIP side by side, one benefit per row. */
export function VipCompareTable(props: VipCompareTableProps) {
  const { t } = useTranslation()
  const rows: CompareRow[] = getVipBenefits(props.info, t).map((benefit) => ({
    id: benefit.id,
    label: benefit.label,
    standard: benefit.standard,
    vip: benefit.vip,
  }))
  const rule = getVipUpgradeRule(props.info, t)
  if (rule) {
    rows.push({
      id: 'how',
      label: t('How to get it'),
      standard: t('Every account after sign-up'),
      vip: t('{{rule}}, upgraded automatically', { rule }),
    })
  }

  const columns: StaticDataTableColumn<CompareRow>[] = [
    {
      id: 'label',
      header: t('Benefit'),
      cellClassName: 'text-muted-foreground py-2.5 align-top whitespace-normal',
      cell: (row) => row.label,
    },
    {
      id: 'standard',
      header: t('Standard'),
      cellClassName: 'py-2.5 align-top whitespace-normal',
      cell: (row) => row.standard,
    },
    {
      id: 'vip',
      header: (
        <span className={cn('inline-flex items-center gap-1', VIP_GOLD_TEXT)}>
          <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
          VIP
        </span>
      ),
      className: 'bg-amber-500/10',
      cellClassName: cn(
        'bg-amber-500/10 py-2.5 align-top font-semibold whitespace-normal',
        VIP_GOLD_TEXT
      ),
      cell: (row) => row.vip,
    },
  ]

  return (
    <StaticDataTable
      className={props.className}
      columns={columns}
      data={rows}
      getRowKey={(row) => row.id}
    />
  )
}
