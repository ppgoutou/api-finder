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

import { Button } from '@/components/ui/button'
import { getCurrencyDisplay } from '@/lib/currency'
import { formatCurrencyUSD, formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getOpsSupplierBalances } from '../../api'
import { supplierRunwayDays } from '../../lib/ops-insights'
import type { OpsSupplierBalance, OpsUpstream } from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'

// A wallet that runs out within this many days is flagged.
const RUNWAY_WARNING_DAYS = 7

export function OpsSupplierWalletsPanel(props: { upstream: OpsUpstream[] }) {
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

  return (
    <PanelWrapper
      title={t('Supplier wallet balances')}
      description={
        checkedAt
          ? t(
              'Read live from each supplier with an enabled channel. Days left use the last 7 days of usage. Read at {{time}}',
              { time: formatTimestampToDate(checkedAt) }
            )
          : t(
              'Read live from each supplier with an enabled channel. Days left use the last 7 days of usage.'
            )
      }
      loading={query.isLoading}
      empty={!query.isLoading && suppliers.length === 0}
      emptyMessage={
        query.isError
          ? query.error.message
          : t('No supplier has an enabled channel')
      }
      height='h-24'
      headerActions={
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label={t('Refresh')}
        >
          <RefreshCw
            className={query.isFetching ? 'animate-spin' : undefined}
          />
        </Button>
      }
    >
      <ul className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {suppliers.map((supplier) => (
          <OpsSupplierWalletCard
            key={supplier.host}
            supplier={supplier}
            upstream={props.upstream}
          />
        ))}
      </ul>
    </PanelWrapper>
  )
}

function OpsSupplierWalletCard(props: {
  supplier: OpsSupplierBalance
  upstream: OpsUpstream[]
}) {
  const { t } = useTranslation()
  const supplier = props.supplier
  const channelIds = new Set(supplier.channels.map((channel) => channel.id))
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
  if (supplier.source !== '' && days != null) {
    status = t('About {{days}} days left', { days: Math.floor(days) })
  } else if (balance != null) {
    status = t('No usage in the last 7 days')
  } else if (failed) {
    status = t('Failed to read the balance')
  }

  return (
    <li
      className={cn(
        'rounded-control flex flex-col gap-0.5 border px-3 py-2',
        (low || failed) && 'border-destructive/50 bg-destructive/5'
      )}
    >
      <div className='truncate text-sm font-medium' title={supplier.host}>
        {supplier.host}
      </div>
      <div
        className={cn(
          'font-mono text-lg font-semibold tabular-nums',
          low && 'text-destructive'
        )}
      >
        {balance == null ? '—' : formatCurrencyUSD(balance)}
      </div>
      <div
        className={cn(
          'text-xs',
          low || failed ? 'text-destructive' : 'text-muted-foreground'
        )}
        title={supplier.error}
      >
        {status}
      </div>
      {supplier.source === '' && (
        <div className='text-muted-foreground text-xs'>
          {t('Add an upstream balance monitor or a supplier token to read it')}
        </div>
      )}
      <div
        className='text-muted-foreground truncate text-xs'
        title={supplier.channels.map((channel) => channel.name).join(', ')}
      >
        {t('Channels: {{names}}', {
          names: supplier.channels.map((channel) => channel.name).join(', '),
        })}
      </div>
    </li>
  )
}
