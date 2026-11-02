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
import { Gift } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { AFFILIATE_PAGE_SIZE, useAffiliateRebates } from '../hooks'
import { AffiliatePager } from './affiliate-pager'

interface AffiliateRebatesCardProps {
  /** Daily HH:MM when pending invitation quota moves to the balance */
  autoTransferTime?: string
}

export function AffiliateRebatesCard(props: AffiliateRebatesCardProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAffiliateRebates(page)
  const items = data?.items ?? []
  const total = data?.total ?? 0

  let body = (
    <ul className='divide-y'>
      {items.map((rebate) => {
        const reversed = rebate.status === 'reversed'
        return (
          <li
            key={`${rebate.created_at}-${rebate.source_type}-${rebate.rebate_quota}-${rebate.invitee_name}`}
            className='flex items-center justify-between gap-3 py-3'
          >
            <div className='min-w-0'>
              <div className='truncate text-sm font-medium'>
                {[rebate.invitee_name, rebate.invitee_email]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className='text-muted-foreground flex items-center gap-2 text-xs tabular-nums'>
                {formatTimestampToDate(rebate.created_at)}
                <span>
                  {rebate.source_type === 'redemption'
                    ? t('Redemption code')
                    : t('Top-up')}
                </span>
                {reversed ? (
                  <StatusBadge
                    label={t('Reversed')}
                    variant='neutral'
                    type='text'
                    copyable={false}
                    className='font-normal'
                  />
                ) : null}
              </div>
            </div>
            <span
              className={
                reversed
                  ? 'text-muted-foreground shrink-0 text-sm tabular-nums line-through'
                  : 'shrink-0 text-sm font-semibold tabular-nums'
              }
            >
              +{formatQuota(rebate.rebate_quota)}
            </span>
          </li>
        )
      })}
    </ul>
  )
  if (isLoading) {
    body = (
      <div className='space-y-3 py-2'>
        <Skeleton className='h-10' />
        <Skeleton className='h-10' />
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={Gift}
        title={t('No rebates yet')}
        className='min-h-[180px]'
      />
    )
  }

  return (
    <Card data-card-hover='false' className='py-0'>
      <CardContent className='p-3 sm:p-4'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-sm font-semibold'>{t('Rebates')}</h3>
          {props.autoTransferTime ? (
            <span className='text-muted-foreground text-xs'>
              {t('Moves to your balance daily at {{time}}', {
                time: props.autoTransferTime,
              })}
            </span>
          ) : null}
        </div>
        {body}
        <AffiliatePager
          page={page}
          totalPages={Math.max(1, Math.ceil(total / AFFILIATE_PAGE_SIZE))}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  )
}
