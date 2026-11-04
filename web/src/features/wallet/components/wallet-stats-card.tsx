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

import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <div className='grid grid-cols-2 items-end gap-x-6 gap-y-3 px-1 sm:grid-cols-[2fr_1fr_1fr]'>
        <div className='col-span-2 sm:col-span-1'>
          <Skeleton className='h-4 w-20' />
          <Skeleton className='mt-2 h-10 w-48 sm:h-12' />
        </div>
        {['usage', 'requests'].map((key) => (
          <div key={key}>
            <Skeleton className='h-3.5 w-16' />
            <Skeleton className='mt-2 h-6 w-24' />
          </div>
        ))}
      </div>
    )
  }

  const secondaryStats = [
    {
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
    },
    {
      label: t('API Requests'),
      value: (props.user?.request_count ?? 0).toLocaleString(),
    },
  ]

  return (
    <div className='grid grid-cols-2 items-end gap-x-6 gap-y-3 px-1 sm:grid-cols-[2fr_1fr_1fr]'>
      <div className='col-span-2 min-w-0 sm:col-span-1'>
        <div className='text-muted-foreground text-sm'>
          {t('Current Balance')}
        </div>
        <div className='text-foreground mt-1 text-4xl font-bold tracking-tight break-all tabular-nums sm:text-5xl'>
          {formatQuota(props.user?.quota ?? 0)}
        </div>
      </div>
      {secondaryStats.map((item) => (
        <div key={item.label} className='min-w-0'>
          <div className='text-muted-foreground truncate text-[13px]'>
            {item.label}
          </div>
          <div className='text-foreground mt-1 text-base font-semibold break-all tabular-nums sm:text-xl'>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
