import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import {
  useCanEditModelPricing,
  useModelPricing,
} from '@/features/model-pricing/api'
import { modelPricingDisplay } from '@/features/model-pricing/pricing'
import { DynamicPricingBreakdown } from '@/features/pricing/components/dynamic-pricing-breakdown'
import { ModelPriceCell } from '@/features/pricing/components/model-price-cell'
import { isDynamicPricingModel } from '@/features/pricing/lib/dynamic-price'
import type { BillingUsageSchema, PricingModel } from '@/features/pricing/types'
import { requireServerSuccess } from '@/lib/server-error-message'

import { checkUpstreamPrices } from '../../api'
import { hasEffectivePricing, undeclaredUsageKeys } from '../../lib/onboarding'
import { modelsQueryKeys } from '../../lib/query-keys'
import type { OnboardingMarkup, UpstreamModelPrice } from '../../types'
import { OnboardingMarkupTable } from './onboarding-markup-table'

/**
 * Read-only price of an onboarding model. Prices follow the supplier. Local
 * prices may rewrite the supplier's expression, so they are never compared
 * with it by code: once the supplier changes its price, the admin fetches the
 * latest price, reads it next to the current one, and either confirms it or
 * marks the change handled after updating the local price.
 */
export function OnboardingPriceCard(props: {
  modelName: string
  upstream: UpstreamModelPrice | undefined
  markup: OnboardingMarkup | undefined
  priceFactor: number
  applying: boolean
  onApply: () => void
  acknowledging: boolean
  onAcknowledge: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canEdit = useCanEditModelPricing()
  const query = useModelPricing([props.modelName], canEdit)
  const [fetchedModel, setFetchedModel] = useState<string | null>(null)
  const fetchLatest = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await checkUpstreamPrices()).data,
    onSuccess: async (report) => {
      queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report)
      // A check prices served models that have no price yet.
      await queryClient.invalidateQueries({
        queryKey: ['model-pricing-config'],
      })
      const failed = report?.channels.find(
        (channel) =>
          channel.id === props.upstream?.channel_id &&
          channel.status === 'error'
      )
      if (failed) {
        setFetchedModel(null)
        toast.error(
          t('Could not fetch the latest price: {{error}}', {
            error: failed.error ?? '',
          })
        )
        return
      }
      setFetchedModel(props.modelName)
    },
  })
  const entry = query.data?.entries.find(
    (item) => item.model_name === props.modelName
  )

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
    const priced = entry ? hasEffectivePricing(entry) : false
    const current =
      entry && priced ? (
        <PriceSummary
          model={modelPricingDisplay(entry)}
          usageSchema={entry.usage_schema}
        />
      ) : null
    const latestPricing =
      fetchedModel === props.modelName &&
      !props.upstream?.in_sync &&
      !props.upstream?.error
        ? props.upstream?.pricing
        : undefined
    const latestExpr = latestPricing?.['billing_setting.billing_expr']
    const undeclared = undeclaredUsageKeys(latestExpr, entry?.usage_schema)
    // A schema that lacks the price's fields would misread its tiers.
    const latestSchema = undeclared.length ? undefined : entry?.usage_schema
    body = (
      <div className='space-y-3'>
        <UpstreamPriceStatus
          upstream={props.upstream}
          priced={priced}
          fetching={fetchLatest.isPending}
          onFetch={() => fetchLatest.mutate()}
          canConfirm={latestPricing !== undefined && undeclared.length === 0}
          applying={props.applying}
          onApply={props.onApply}
          acknowledging={props.acknowledging}
          onAcknowledge={props.onAcknowledge}
        />
        {undeclared.length > 0 && latestPricing && (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'The task plugin does not declare these usage fields yet: {{fields}}. Update the plugin first.',
              { fields: undeclared.join(', ') }
            )}
          </p>
        )}
        {latestPricing ? (
          <div className='grid gap-4 lg:grid-cols-2'>
            <section className='min-w-0 space-y-2'>
              <h4 className='text-sm font-medium'>{t('Current price')}</h4>
              {current ?? (
                <p className='text-muted-foreground text-sm'>
                  {t('No price yet')}
                </p>
              )}
            </section>
            <section className='min-w-0 space-y-2'>
              <h4 className='text-sm font-medium'>
                {t('Latest upstream price')}
              </h4>
              <PriceSummary
                model={modelPricingDisplay({
                  model_name: props.modelName,
                  effective: latestPricing,
                  usage_schema: latestSchema,
                })}
                usageSchema={latestSchema}
              />
            </section>
          </div>
        ) : (
          current
        )}
        {entry && priced && (
          <OnboardingMarkupTable
            entry={entry}
            markup={props.markup}
            priceFactor={props.priceFactor}
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
    >
      {body}
    </TitledCard>
  )
}

function PriceSummary(props: {
  model: PricingModel
  usageSchema: BillingUsageSchema | undefined
}) {
  return (
    <div className='space-y-2'>
      <div className='max-w-xs'>
        <ModelPriceCell
          model={props.model}
          options={{ tokenUnit: 'M' }}
          showExpression={false}
        />
      </div>
      {isDynamicPricingModel(props.model) && (
        <DynamicPricingBreakdown
          compact
          sortTiersBySchema
          billingExpr={props.model.billing_expr}
          usageSchema={props.usageSchema}
        />
      )}
    </div>
  )
}

function UpstreamPriceStatus(props: {
  upstream: UpstreamModelPrice | undefined
  priced: boolean
  fetching: boolean
  onFetch: () => void
  canConfirm: boolean
  applying: boolean
  onApply: () => void
  acknowledging: boolean
  onAcknowledge: () => void
}) {
  const { t } = useTranslation()
  if (!props.upstream) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t(
          'No upstream price yet. Add the supplier token, then check upstream prices.'
        )}
      </p>
    )
  }
  if (props.upstream.error) {
    return (
      <p role='alert' className='text-destructive text-sm'>
        {t(props.upstream.error)}
      </p>
    )
  }
  if (props.upstream.in_sync) {
    return (
      <StatusBadge
        size='sm'
        variant='success'
        label={t('Upstream price of {{name}} unchanged', {
          name: props.upstream.channel_name,
        })}
      />
    )
  }
  const busy = props.fetching || props.applying || props.acknowledging
  return (
    <div className='flex flex-wrap items-center justify-between gap-2'>
      <StatusBadge
        size='sm'
        variant='warning'
        label={
          props.priced
            ? t('Upstream price of {{name}} changed', {
                name: props.upstream.channel_name,
              })
            : t('No price yet')
        }
      />
      <div className='flex flex-wrap gap-2'>
        {props.priced && (
          <Button
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={props.onAcknowledge}
          >
            {t('Mark handled')}
          </Button>
        )}
        <Button
          size='sm'
          variant={props.canConfirm ? 'outline' : 'default'}
          disabled={busy}
          onClick={props.onFetch}
        >
          {props.fetching ? t('Fetching...') : t('Fetch latest price')}
        </Button>
        {props.canConfirm && (
          <Button size='sm' disabled={busy} onClick={props.onApply}>
            {props.applying ? t('Saving...') : t('Confirm upstream price')}
          </Button>
        )}
      </div>
    </div>
  )
}
