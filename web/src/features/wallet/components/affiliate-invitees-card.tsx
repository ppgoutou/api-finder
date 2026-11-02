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
import { Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { AFFILIATE_PAGE_SIZE, useAffiliateInvitees } from '../hooks'
import { AffiliatePager } from './affiliate-pager'

const USER_STATUS_ENABLED = 1

export function AffiliateInviteesCard() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAffiliateInvitees(page)
  const items = data?.items ?? []
  const total = data?.total ?? 0

  let body = (
    <ul className='divide-y'>
      {items.map((invitee) => (
        <li
          key={`${invitee.created_at}-${invitee.name}-${invitee.email}`}
          className='flex items-center justify-between gap-3 py-3'
        >
          <div className='flex min-w-0 items-center gap-3'>
            <Users
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
            <div className='min-w-0'>
              <div className='truncate text-sm font-medium'>
                {[invitee.name, invitee.email].filter(Boolean).join(' · ')}
              </div>
              <div className='text-muted-foreground flex items-center gap-2 text-xs tabular-nums'>
                {formatTimestampToDate(invitee.created_at)}
                <StatusBadge
                  label={
                    invitee.status === USER_STATUS_ENABLED
                      ? t('Enabled')
                      : t('Disabled')
                  }
                  variant={
                    invitee.status === USER_STATUS_ENABLED
                      ? 'success'
                      : 'neutral'
                  }
                  type='text'
                  copyable={false}
                  className='font-normal'
                />
              </div>
            </div>
          </div>
          <span className='shrink-0 text-sm font-semibold tabular-nums'>
            {formatQuota(invitee.rebate_quota ?? 0)}
          </span>
        </li>
      ))}
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
        icon={Users}
        title={t('No invitees yet')}
        description={t(
          'Users who sign up with your invitation code or link appear here.'
        )}
        className='min-h-[180px]'
      />
    )
  }

  return (
    <Card data-card-hover='false' className='py-0'>
      <CardContent className='p-3 sm:p-4'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-sm font-semibold'>{t('Invitees')}</h3>
          <span className='text-muted-foreground text-xs'>
            {t('{{count}} in total', { count: total })}
          </span>
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
