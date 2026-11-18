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
import {
  CrownIcon,
  MinusSignIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { cn } from '@/lib/utils'

import { VIP_BENEFIT_ICONS } from '../lib/benefit-icons'
import { getVipBenefits, type VipBenefit } from '../lib/benefits'
import { VIP_LIME_TEXT } from '../lib/vip-style'
import type { MembershipInfo } from '../types'

interface VipCompareTableProps {
  info: MembershipInfo
  className?: string
}

/**
 * Standard and VIP side by side, one benefit per row. The membership fee row
 * is left out: both tiers are free, which the surrounding copy already says.
 */
export function VipCompareTable(props: VipCompareTableProps) {
  const { t } = useTranslation()
  const rows = getVipBenefits(props.info, t).filter(
    (benefit) => benefit.id !== 'no-fee'
  )

  const columns: StaticDataTableColumn<VipBenefit>[] = [
    {
      id: 'label',
      header: t('Benefit'),
      className: 'w-[24%] text-xs text-white/40 sm:w-[26%]',
      cellClassName: 'py-2.5 align-top whitespace-normal',
      cell: (row) => (
        <span className='flex items-center gap-2 text-white/55'>
          <HugeiconsIcon
            icon={VIP_BENEFIT_ICONS[row.id]}
            className='hidden size-4 shrink-0 sm:block'
            aria-hidden
          />
          {row.label}
        </span>
      ),
    },
    {
      id: 'standard',
      header: t('Standard'),
      className: 'w-[33%] text-xs text-white/40 sm:w-[34%]',
      cellClassName: 'py-2.5 align-top whitespace-normal',
      cell: (row) => (
        <span className='flex items-start gap-1.5 text-white/55'>
          <HugeiconsIcon
            icon={MinusSignIcon}
            className='mt-0.5 hidden size-3.5 shrink-0 opacity-60 sm:block'
            aria-hidden
          />
          {row.standard}
        </span>
      ),
    },
    {
      id: 'vip',
      header: (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-semibold',
            VIP_LIME_TEXT
          )}
        >
          <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
          VIP
        </span>
      ),
      className: 'bg-accent-night/[0.08]',
      cellClassName:
        'bg-accent-night/[0.05] py-2.5 align-top whitespace-normal',
      cell: (row) => (
        <span
          className={cn(
            'flex items-start gap-1.5 font-semibold',
            VIP_LIME_TEXT
          )}
        >
          <HugeiconsIcon
            icon={Tick02Icon}
            className='mt-0.5 size-3.5 shrink-0'
            aria-hidden
          />
          {row.vip}
        </span>
      ),
    },
  ]

  return (
    <StaticDataTable
      className={cn(
        'rounded-2xl border-white/10 bg-white/[0.02] [&_tr]:border-white/[0.07]',
        props.className
      )}
      tableClassName='table-fixed text-sm'
      headerRowClassName='hover:bg-transparent'
      columns={columns}
      data={rows}
      getRowKey={(row) => row.id}
      getRowClassName={() => 'hover:bg-transparent'}
    />
  )
}
