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

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import type { ModelPricingEntry } from '@/features/model-pricing/api'
import { modelPricingDisplay } from '@/features/model-pricing/pricing'
import { DynamicPricingBreakdown } from '@/features/pricing/components/dynamic-pricing-breakdown'
import { ModelPriceCell } from '@/features/pricing/components/model-price-cell'
import { isDynamicPricingModel } from '@/features/pricing/lib/dynamic-price'
import type { BillingUsageSchema, PricingModel } from '@/features/pricing/types'
import { getCurrencyDisplay } from '@/lib/currency'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { undeclaredUsageKeys } from '../../lib/onboarding'
import {
  comparePriceRows,
  markupRowCondition,
  type PriceComparisonRow,
} from '../../lib/onboarding-markup'
import type {
  OnboardingMarkup,
  UpstreamModelPrice,
  UpstreamPriceChange,
} from '../../types'
import { ChangeFields } from './onboarding-upstream-prices'

/**
 * The supplier price just fetched for one model next to the current one, so
 * the admin decides whether to apply it. Nothing changes before that.
 */
export function UpstreamPriceDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelName: string
  entry: ModelPricingEntry | undefined
  priced: boolean
  upstream: UpstreamModelPrice | undefined
  change: UpstreamPriceChange | undefined
  markup: OnboardingMarkup | undefined
  priceFactor: number
  busy: boolean
  applying: boolean
  onApply: () => void
  /** Absent when there is no change to handle. */
  onAcknowledge?: () => void
}) {
  const { t } = useTranslation()
  const latest = props.upstream?.error ? undefined : props.upstream?.pricing
  const undeclared = undeclaredUsageKeys(
    latest?.['billing_setting.billing_expr'],
    props.entry?.usage_schema
  )
  const canApply = latest !== undefined && undeclared.length === 0

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Latest upstream price')}
      description={t(
        '{{model}}: check the change, then decide whether to apply it. Nothing changes until you apply it.',
        { model: props.modelName }
      )}
      contentClassName='sm:max-w-4xl'
      footer={
        <>
          <Button
            variant='outline'
            disabled={props.busy}
            onClick={() => props.onOpenChange(false)}
          >
            {latest ? t('Keep current price') : t('Close')}
          </Button>
          {props.onAcknowledge && (
            <Button
              variant='outline'
              disabled={props.busy}
              onClick={props.onAcknowledge}
            >
              {t('Mark handled')}
            </Button>
          )}
          {canApply && (
            <Button disabled={props.busy} onClick={props.onApply}>
              {props.applying ? t('Saving...') : t('Apply upstream price')}
            </Button>
          )}
        </>
      }
    >
      <div className='space-y-4'>
        <UpstreamPriceStatus
          upstream={props.upstream}
          change={props.change}
          priced={props.priced}
          watched
        />
        {latest && undeclared.length > 0 && (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'The task plugin does not declare these usage fields yet: {{fields}}. Update the plugin first.',
              { fields: undeclared.join(', ') }
            )}
          </p>
        )}
        {latest && (
          <PriceComparison
            modelName={props.modelName}
            entry={props.entry}
            priced={props.priced}
            latest={latest}
            // A schema that lacks the price's fields would misread its tiers.
            schema={undeclared.length ? undefined : props.entry?.usage_schema}
            markup={props.markup}
            priceFactor={props.priceFactor}
          />
        )}
      </div>
    </Dialog>
  )
}

function PriceComparison(props: {
  modelName: string
  entry: ModelPricingEntry | undefined
  priced: boolean
  latest: NonNullable<UpstreamModelPrice['pricing']>
  schema: BillingUsageSchema | undefined
  markup: OnboardingMarkup | undefined
  priceFactor: number
}) {
  const { t, i18n } = useTranslation()
  useSystemConfigStore((s) => s.config.currency)
  const rows = props.entry
    ? comparePriceRows(
        { ...props.entry, usage_schema: props.schema },
        props.markup,
        props.latest,
        props.priceFactor
      )
    : []
  if (rows.length === 0) {
    return (
      <div className='grid gap-4 lg:grid-cols-2'>
        <section className='min-w-0 space-y-2'>
          <h4 className='text-sm font-medium'>{t('Current price')}</h4>
          {props.entry && props.priced ? (
            <PriceSummary
              model={modelPricingDisplay(props.entry)}
              usageSchema={props.entry.usage_schema}
            />
          ) : (
            <p className='text-muted-foreground text-sm'>{t('No price yet')}</p>
          )}
        </section>
        <section className='min-w-0 space-y-2'>
          <h4 className='text-sm font-medium'>{t('Latest upstream price')}</h4>
          <PriceSummary
            model={modelPricingDisplay({
              model_name: props.modelName,
              effective: props.latest,
              usage_schema: props.schema,
            })}
            usageSchema={props.schema}
          />
        </section>
      </div>
    )
  }

  const { meta } = getCurrencyDisplay()
  const symbol = meta.kind === 'tokens' ? '$' : meta.symbol
  const rate = meta.kind === 'tokens' ? 1 : meta.exchangeRate
  const language = i18n.resolvedLanguage || i18n.language
  const price = (usd: number | undefined, row: PriceComparisonRow) => {
    if (usd === undefined) return '—'
    let unit = t('s')
    if (row.row.unit === 'image') unit = t('image')
    else if (row.row.unit === 'video') unit = t('video')
    return `${symbol}${(usd * rate).toFixed(4)}/${unit}`
  }
  const columns: StaticDataTableColumn<PriceComparisonRow>[] = [
    {
      id: 'condition',
      header: t('Conditions'),
      cell: ({ row }) =>
        markupRowCondition(row, rows.length === 1, props.schema, language, t),
    },
    {
      id: 'current-supply',
      header: t('Current supply price'),
      cellClassName: 'font-mono',
      cell: (row) => price(row.currentSupply, row),
    },
    {
      id: 'latest-supply',
      header: t('Latest supply price'),
      cellClassName: 'font-mono font-medium',
      cell: (row) => (
        <div>
          {price(row.latestSupply, row)}
          <PriceDelta from={row.currentSupply} to={row.latestSupply} />
        </div>
      ),
    },
    {
      id: 'current-final',
      header: t('Current final price'),
      cellClassName: 'font-mono',
      cell: (row) => price(row.currentFinal, row),
    },
    {
      id: 'latest-final',
      header: t('Final price after applying'),
      cellClassName: 'font-mono font-medium',
      cell: (row) => {
        const loss =
          row.latestFinal !== undefined &&
          row.latestSupply !== undefined &&
          row.latestFinal < row.latestSupply
        return (
          <div className={cn(loss && 'text-destructive')}>
            {price(row.latestFinal, row)}
            {loss && (
              <div className='font-sans text-xs font-normal'>
                {t('Below supply price')}
              </div>
            )}
          </div>
        )
      },
    },
  ]
  return (
    <section className='space-y-2'>
      <StaticDataTable
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={rows}
        getRowKey={(row) => row.row.tier}
        columns={columns}
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          'Supply prices already include the key group ratio. Final prices are for the default group; saved price adjustments stay unchanged.'
        )}
      </p>
    </section>
  )
}

/** How far the supply price moves: a rise costs more, a cut costs less. */
function PriceDelta(props: {
  from: number | undefined
  to: number | undefined
}) {
  if (!props.from || props.to === undefined) return null
  const percent = Number(((props.to / props.from - 1) * 100).toFixed(2))
  if (percent === 0) return null
  return (
    <div
      className={cn(
        'text-xs font-normal',
        percent > 0 ? 'text-destructive' : 'text-success'
      )}
    >
      {percent > 0 ? '+' : ''}
      {formatPercent(percent)}
    </div>
  )
}

export function PriceSummary(props: {
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

/** Where the model's supplier price stands and what changed about it. */
export function UpstreamPriceStatus(props: {
  upstream: UpstreamModelPrice | undefined
  change: UpstreamPriceChange | undefined
  priced: boolean
  /** Whether a channel of the model has a supplier token. */
  watched: boolean
}) {
  const { t } = useTranslation()
  const upstream = props.upstream
  if (!upstream && props.change?.kind === 'removed') {
    return (
      <div className='min-w-0 space-y-1.5'>
        <StatusBadge
          size='sm'
          variant='danger'
          label={t('Gone from price list')}
        />
        <p className='text-sm'>
          {t(
            'The price list of {{name}} no longer has this model, so there is no upstream price to apply. The current price stays as it is.',
            { name: props.change.channel_name }
          )}
        </p>
      </div>
    )
  }
  if (!upstream) {
    return (
      <p className='text-muted-foreground text-sm'>
        {props.watched
          ? t("The supplier's price list has no price for this model.")
          : t(
              'No upstream price yet. Add the supplier token, then check upstream prices.'
            )}
      </p>
    )
  }
  if (upstream.error) {
    return (
      <p role='alert' className='text-destructive text-sm'>
        {t(upstream.error)}
      </p>
    )
  }
  if (upstream.in_sync) {
    return (
      <StatusBadge
        size='sm'
        variant='success'
        label={t('Upstream price of {{name}} unchanged', {
          name: upstream.channel_name,
        })}
      />
    )
  }
  return (
    <div className='min-w-0 space-y-1.5'>
      <StatusBadge
        size='sm'
        variant='warning'
        label={
          props.priced
            ? t('Upstream price of {{name}} changed', {
                name: upstream.channel_name,
              })
            : t('No price yet')
        }
      />
      {props.change?.channel_id === upstream.channel_id && (
        <ChangeFields change={props.change} hideExpressions />
      )}
    </div>
  )
}
