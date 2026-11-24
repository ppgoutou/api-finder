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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import {
  useCanEditModelPricing,
  useModelPricing,
} from '@/features/model-pricing/api'
import { modelPricingDisplay } from '@/features/model-pricing/pricing'
import type { PricingCategory } from '@/features/pricing/types'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { checkUpstreamPrices } from '../../api'
import { hasEffectivePricing } from '../../lib/onboarding'
import { modelsQueryKeys } from '../../lib/query-keys'
import type { OnboardingModel, UpstreamPriceReport } from '../../types'
import { OnboardingMarkupTable } from './onboarding-markup-table'
import {
  PriceSummary,
  UpstreamPriceDialog,
  UpstreamPriceStatus,
} from './onboarding-upstream-price-dialog'

/**
 * Read-only price of an onboarding model. Prices follow the supplier. Local
 * prices may rewrite the supplier's expression, so they are never compared
 * with it by code: the admin fetches the latest supplier price, reads it next
 * to the current one, and decides whether to apply it.
 */
export function OnboardingPriceCard(props: {
  item: OnboardingModel
  report: UpstreamPriceReport | undefined
  groupRatios: Record<string, number>
  categories: PricingCategory[]
  applying: boolean
  onApply: (onApplied: () => void) => void
  acknowledging: boolean
  onAcknowledge: (onAcknowledged: () => void) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canEdit = useCanEditModelPricing()
  const modelName = props.item.model_name
  const query = useModelPricing([modelName], canEdit)
  const [reviewing, setReviewing] = useState(false)
  const upstream = props.report?.models?.[modelName]
  const markup = props.report?.markups?.[modelName]
  const priceFactor = props.report?.price_factor ?? 1
  const channelIds = [
    ...props.item.channels,
    ...props.item.pending_channels,
  ].map((channel) => channel.id)
  const watched = (props.report?.channels ?? []).filter(
    (channel) => channel.has_token && channelIds.includes(channel.id)
  )
  const changes = (props.report?.changes ?? []).filter(
    (item) => item.model_name === modelName
  )
  // The change of the channel the price comes from, else the one that dropped
  // the model; another channel's change still waits to be marked handled.
  const change =
    changes.find((item) => item.channel_id === upstream?.channel_id) ??
    changes.find((item) => item.kind === 'removed') ??
    changes[0]

  const fetchLatest = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await checkUpstreamPrices()).data,
    onSuccess: async (report) => {
      queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report)
      // A check prices served models that have no price yet.
      await queryClient.invalidateQueries({
        queryKey: ['model-pricing-config'],
      })
      const source = report?.models?.[modelName]?.channel_id
      const failed = report?.channels.find(
        (channel) =>
          channel.status === 'error' &&
          (source === undefined
            ? channelIds.includes(channel.id)
            : channel.id === source)
      )
      if (failed) {
        toast.error(
          t('Could not fetch the latest price: {{error}}', {
            error: failed.error ?? '',
          })
        )
        return
      }
      setReviewing(true)
    },
  })
  const entry = query.data?.entries.find(
    (item) => item.model_name === modelName
  )
  const priced = entry ? hasEffectivePricing(entry) : false
  const acknowledgeable =
    change !== undefined && (priced || change.kind === 'removed')

  let body = <LoadingState />
  if (!canEdit) {
    body = (
      <p className='text-muted-foreground text-sm'>
        {t('Only super administrators can edit pricing.')}
      </p>
    )
  } else if (query.isError) {
    body = (
      <ErrorState
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (query.isSuccess) {
    body = (
      <div className='space-y-3'>
        {props.report && (
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <UpstreamPriceStatus
              upstream={upstream}
              change={change}
              priced={priced}
              watched={watched.length > 0}
            />
            {acknowledgeable && (
              <Button
                size='sm'
                variant='outline'
                disabled={props.acknowledging || props.applying}
                onClick={() => props.onAcknowledge(() => setReviewing(false))}
              >
                {t('Mark handled')}
              </Button>
            )}
          </div>
        )}
        {entry && priced && (
          <>
            <PriceSummary
              model={modelPricingDisplay(entry)}
              usageSchema={entry.usage_schema}
            />
            <OnboardingMarkupTable
              entry={entry}
              markup={markup}
              priceFactor={priceFactor}
              groupRatios={props.groupRatios}
              categories={props.categories}
            />
          </>
        )}
        {props.report && (
          <UpstreamPriceDialog
            open={reviewing}
            onOpenChange={setReviewing}
            modelName={modelName}
            entry={entry}
            priced={priced}
            upstream={upstream}
            change={change}
            markup={markup}
            priceFactor={priceFactor}
            busy={props.applying || props.acknowledging}
            applying={props.applying}
            onApply={() => props.onApply(() => setReviewing(false))}
            onAcknowledge={
              acknowledgeable
                ? () => props.onAcknowledge(() => setReviewing(false))
                : undefined
            }
          />
        )}
      </div>
    )
  }

  return (
    <TitledCard
      title={t('Pricing')}
      description={t(
        'Prices follow the upstream. Customers pay the group ratio price plus any extra markup.'
      )}
      action={
        canEdit && (
          <Button
            size='sm'
            variant='outline'
            disabled={
              fetchLatest.isPending ||
              props.applying ||
              props.acknowledging ||
              watched.length === 0
            }
            onClick={() => fetchLatest.mutate()}
          >
            <RefreshCw
              aria-hidden
              className={cn('size-4', fetchLatest.isPending && 'animate-spin')}
            />
            {fetchLatest.isPending
              ? t('Fetching...')
              : t('Fetch latest upstream price')}
          </Button>
        )
      }
    >
      {body}
    </TitledCard>
  )
}
