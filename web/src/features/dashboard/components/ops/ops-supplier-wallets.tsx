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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { getCurrencyDisplay } from '@/lib/currency'
import { formatCurrencyUSD, formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getOpsSupplierBalances } from '../../api'
import { supplierRunwayDays } from '../../lib/ops-insights'
import type { OpsSupplierBalance, OpsUpstream } from '../../types'

// A wallet that runs out within this many days is flagged.
const RUNWAY_WARNING_DAYS = 7

/** One compact row of supplier wallets, read live from each supplier. */
export function OpsSupplierWallets(props: { upstream: OpsUpstream[] }) {
  const { t } = useTranslation()
  // Balances are read live from each supplier, apart from the dashboard
  // figures, so a slow supplier never holds up the rest of the page.
  const query = useQuery({
    queryKey: ['dashboard', 'ops', 'supplier-balances'],
    queryFn: async () => requireServerSuccess(await getOpsSupplierBalances()),
    select: (res) => res.data,
    staleTime: 60_000,
  })
  const suppliers = query.data?.suppliers ?? []
  const checkedAt = query.data?.checked_at

  let content
  if (query.isLoading) {
    content = <Skeleton className='h-14 w-full' />
  } else if (query.isError) {
    content = (
      <p className='text-destructive text-xs'>{query.error.message}</p>
    )
  } else if (suppliers.length === 0) {
    content = (
      <p className='text-muted-foreground text-xs'>
        {t('No supplier has an enabled channel')}
      </p>
    )
  } else {
    content = (
      <ul className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {suppliers.map((supplier) => (
          <OpsSupplierWalletCard
            key={supplier.host}
            supplier={supplier}
            upstream={props.upstream}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className='space-y-2 border-t px-3 py-2.5 sm:px-5'>
      <div className='flex items-center gap-2'>
        <span className='text-muted-foreground text-xs font-medium'>
          {t('Supplier wallet balances')}
        </span>
        <span
          className='text-muted-foreground hidden min-w-0 truncate text-xs sm:inline'
          title={t(
            'Read live from each supplier with an enabled channel. Days left use the last 7 days of usage.'
          )}
        >
          {checkedAt
            ? t('Read at {{time}}', { time: formatTimestampToDate(checkedAt) })
            : null}
        </span>
        <Button
          variant='ghost'
          size='icon'
          className='ml-auto size-7'
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label={t('Refresh supplier balances')}
        >
          <RefreshCw
            className={query.isFetching ? 'animate-spin' : undefined}
          />
        </Button>
      </div>
      {content}
    </div>
  )
}

function OpsSupplierWalletCard(props: {
  supplier: OpsSupplierBalance
  upstream: OpsUpstream[]
}) {
  const { t } = useTranslation()
  const supplier = props.supplier
  const channelIds = new Set(supplier.channels.map((channel) => channel.id))
  const channelNames = supplier.channels.map((channel) => channel.name).join(', ')
  const balance = supplier.balance_usd
  const days =
    balance == null
      ? null
      : supplierRunwayDays(
          balance,
          props.upstream.filter((row) => channelIds.has(row.channel_id)),
          getCurrencyDisplay().config.quotaPerUnit
        )
  const low = days != null && days < RUNWAY_WARNING_DAYS
  const failed = supplier.source !== '' && balance == null

  let status = t('Balance not set up')
  if (days != null) {
    status = t('About {{days}} days left', { days: Math.floor(days) })
  } else if (balance != null) {
    status = t('No usage in the last 7 days')
  } else if (failed) {
    status = t('Failed to read the balance')
  }

  return (
    <li
      className={cn(
        'rounded-control flex items-baseline justify-between gap-3 border px-3 py-2',
        (low || failed) && 'border-destructive/50 bg-destructive/5'
      )}
      title={t('Channels: {{names}}', { names: channelNames })}
    >
      <div className='min-w-0'>
        <div className='truncate text-sm font-medium'>{supplier.host}</div>
        <div
          className={cn(
            'truncate text-xs',
            low || failed ? 'text-destructive' : 'text-muted-foreground'
          )}
          title={
            supplier.source === ''
              ? t('Add an upstream balance monitor or a supplier token to read it')
              : supplier.error
          }
        >
          {status}
        </div>
      </div>
      <div
        className={cn(
          'shrink-0 font-mono text-lg font-semibold tabular-nums',
          low && 'text-destructive'
        )}
      >
        {balance == null ? '—' : formatCurrencyUSD(balance)}
      </div>
    </li>
  )
}
