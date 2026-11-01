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

import { hasEffectivePricing } from '../../lib/onboarding'
import type { UpstreamModelPrice } from '../../types'

/**
 * Read-only price of an onboarding model. Prices follow the supplier. Local
 * prices may rewrite the supplier's expression, so they are never compared
 * with it: once the supplier changes its price, the admin either copies the
 * new upstream price or marks it handled after updating the local one.
 */
export function OnboardingPriceCard(props: {
  modelName: string
  upstream: UpstreamModelPrice | undefined
  applying: boolean
  onApply: () => void
  acknowledging: boolean
  onAcknowledge: () => void
}) {
  const { t } = useTranslation()
  const canEdit = useCanEditModelPricing()
  const query = useModelPricing([props.modelName], canEdit)
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
  } else if (query.isSuccess && !entry) {
    body = (
      <UpstreamPriceStatus
        upstream={props.upstream}
        priced={false}
        applying={props.applying}
        onApply={props.onApply}
        acknowledging={props.acknowledging}
        onAcknowledge={props.onAcknowledge}
      />
    )
  } else if (entry) {
    const display = modelPricingDisplay(entry)
    body = (
      <div className='space-y-3'>
        <UpstreamPriceStatus
          upstream={props.upstream}
          priced={hasEffectivePricing(entry)}
          applying={props.applying}
          onApply={props.onApply}
          acknowledging={props.acknowledging}
          onAcknowledge={props.onAcknowledge}
        />
        {hasEffectivePricing(entry) && (
          <div className='space-y-2'>
            <div className='max-w-xs'>
              <ModelPriceCell
                model={display}
                options={{ tokenUnit: 'M' }}
                showExpression={false}
              />
            </div>
            {isDynamicPricingModel(display) && (
              <DynamicPricingBreakdown
                compact
                billingExpr={display.billing_expr}
                usageSchema={entry.usage_schema}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <TitledCard
      title={t('Pricing')}
      description={t(
        'Prices follow the upstream. Your markup comes from the group ratio.'
      )}
    >
      {body}
    </TitledCard>
  )
}

function UpstreamPriceStatus(props: {
  upstream: UpstreamModelPrice | undefined
  priced: boolean
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
  const busy = props.applying || props.acknowledging
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
        <Button size='sm' disabled={busy} onClick={props.onApply}>
          {props.applying ? t('Saving...') : t('Use upstream price')}
        </Button>
      </div>
    </div>
  )
}
