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
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getAffiliateInvitees } from '../api'

const PAGE_SIZE = 10
const USER_STATUS_ENABLED = 1

export function AffiliateInviteesCard() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['wallet', 'affiliate-invitees', page],
    queryFn: async () =>
      requireServerSuccess(await getAffiliateInvitees(page, PAGE_SIZE)).data,
    placeholderData: (previous) => previous,
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
              <div className='text-muted-foreground text-xs tabular-nums'>
                {formatTimestampToDate(invitee.created_at)}
              </div>
            </div>
          </div>
          <StatusBadge
            label={
              invitee.status === USER_STATUS_ENABLED
                ? t('Enabled')
                : t('Disabled')
            }
            variant={
              invitee.status === USER_STATUS_ENABLED ? 'success' : 'neutral'
            }
            copyable={false}
            className='shrink-0 font-normal'
          />
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
        {totalPages > 1 && (
          <div className='flex items-center justify-end gap-2 border-t pt-3'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className='h-8 w-8 p-0'
              aria-label={t('Previous page')}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <span className='text-muted-foreground text-sm tabular-nums'>
              {page} / {totalPages}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className='h-8 w-8 p-0'
              aria-label={t('Next page')}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
