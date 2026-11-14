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
import {
  BadgeCheck,
  ChevronRight,
  CirclePause,
  Play,
  ShieldCheck,
  ThumbsUp,
} from 'lucide-react'
import { memo, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { studioModelsFromPricing } from '@/features/video-studio/lib/draft'
import { studioImageModelsFromPricing } from '@/features/video-studio/lib/image-draft'
import type { StudioKind } from '@/features/video-studio/types'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import { modelBadgeLabel } from '../lib/categories'
import {
  formatTaskUsageUnitPrice,
  getCardExamplePrice,
  getDynamicDisplayGroupRatio,
  getDynamicPriceEntries,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel, modelDisplayName } from '../lib/model-helpers'
import { formatPrice, formatRequestPrice } from '../lib/price'
import {
  taskEnumLabel,
  taskPriceLabel,
  taskUsageUnitLabel,
} from '../lib/task-price-display'
import {
  getTokenVideoPricing,
  getVideoPricing,
  VIDEO_PRICE_FRACTION_DIGITS,
} from '../lib/video-pricing'
import type {
  PricingModel,
  PricingModelBadge,
  PriceType,
  TokenUnit,
} from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'

// Brand color shared by the cheapest tier and the details action; a stable
// card takes its success color instead.
const CARD_ACCENT_CLASS = 'border-brand bg-brand text-white'
const STABLE_CARD_ACCENT_CLASS =
  'border-success bg-success text-success-foreground'

export interface ModelCardProps {
  model: PricingModel
  onClick: (modelName: string) => void
  /** Opens the studio with this model; video and image models offer it. */
  onTry?: (modelName: string, kind: StudioKind) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  badges?: PricingModelBadge[]
}

type HeaderBadge = Exclude<PricingModelBadge, 'stable'>

const MODEL_BADGE_CLASSES: Record<HeaderBadge, string> = {
  recommended: 'bg-brand text-white',
  hot: 'bg-destructive text-destructive-foreground',
  new: 'bg-success text-success-foreground',
  nsfw: 'bg-[#d6246e] text-white',
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t, i18n } = useTranslation()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1
  const showRechargePrice = props.showRechargePrice ?? false
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const tags = parseTags(props.model.tags)
  const groups = props.model.enable_groups || []
  const endpoints = props.model.supported_endpoint_types || []
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const initial = props.model.model_name?.charAt(0).toUpperCase() || '?'
  const isUnconfiguredTaskUsage = isUnconfiguredTaskUsageModel(props.model)
  const billingTime = useBillingTime(props.model.billing_expr)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const dynamicPriceOptions = useMemo(
    () => ({
      now: billingTime === undefined ? undefined : new Date(billingTime),
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      groupRatioMultiplier: getDynamicDisplayGroupRatio(
        props.model,
        props.selectedGroup
      ),
    }),
    [
      props.model,
      props.selectedGroup,
      billingTime,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
    ]
  )
  const dynamicSummary = useMemo(
    () => getDynamicPricingSummary(props.model, dynamicPriceOptions),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.model, dynamicPriceOptions, currency]
  )
  const cardExamplePrice = useMemo(
    () => getCardExamplePrice(props.model, dynamicPriceOptions),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.model, dynamicPriceOptions, currency]
  )
  const videoPricing = useMemo(
    () => getVideoPricing(props.model) ?? getTokenVideoPricing(props.model),
    [props.model]
  )
  const tryKind = useMemo((): StudioKind | null => {
    if (studioModelsFromPricing([props.model]).length > 0) return 'video'
    if (studioImageModelsFromPricing([props.model]).length > 0) return 'image'
    return null
  }, [props.model])
  const showTry = tryKind !== null && props.onTry !== undefined
  const unavailable = props.model.unavailable === true
  // A stable card says so through its look alone: no label in the header.
  const stable = props.badges?.includes('stable') === true
  const headerBadges = (props.badges ?? []).filter(
    (badge): badge is HeaderBadge => badge !== 'stable'
  )
  const accentClass = stable ? STABLE_CARD_ACCENT_CLASS : CARD_ACCENT_CLASS
  const unavailableNote =
    props.model.unavailable_reason?.trim() ||
    t('Temporarily unavailable. Try another model for now.')
  let priceSummary: ReactNode
  if (videoPricing) {
    const optionDefinition =
      props.model.billing_usage_schema?.[videoPricing.optionField]
    const formatSecondPrice = (price: number) =>
      formatTaskUsageUnitPrice(price, {
        ...dynamicPriceOptions,
        fractionDigits: VIDEO_PRICE_FRACTION_DIGITS,
      })
    const lowestRow = videoPricing.rows.reduce((lowest, row) =>
      row.secondPrice < lowest.secondPrice ? row : lowest
    )
    priceSummary = (
      <>
        <p className='col-span-full flex min-w-0 flex-wrap items-end gap-x-2'>
          <span className='font-mono text-4xl leading-none font-bold tracking-tight tabular-nums'>
            {formatSecondPrice(lowestRow.secondPrice)}
          </span>
          <span className='text-muted-foreground pb-0.5 text-xs'>
            {t('/s from')} ·{' '}
            {taskEnumLabel(optionDefinition, lowestRow.option, i18n.language)}
          </span>
        </p>
        <dl
          aria-label={t('Video billing (per second)')}
          className='col-span-full flex flex-wrap gap-1.5'
        >
          {videoPricing.rows.map((row) => (
            <div
              key={row.option}
              className={cn(
                'border-border flex min-w-0 items-baseline gap-1 rounded-full border-[1.5px] px-2.5 py-0.5',
                row === lowestRow && accentClass
              )}
            >
              <dt className='shrink-0 text-xs'>
                {taskEnumLabel(optionDefinition, row.option, i18n.language)}
              </dt>
              <dd className='truncate font-mono text-xs font-bold tabular-nums'>
                {formatSecondPrice(row.secondPrice)}
              </dd>
            </div>
          ))}
        </dl>
        {videoPricing.hasReferencePricing && (
          <span className='text-muted-foreground col-span-full text-xs'>
            {t('Orders with reference videos are priced separately')}
          </span>
        )}
        {videoPricing.rows.some(
          (row) => row.inputVideoSecondPrice !== undefined
        ) && (
          <span className='text-muted-foreground col-span-full text-xs'>
            {t('Reference videos and extra input images cost more')}
          </span>
        )}
      </>
    )
  } else if (dynamicSummary) {
    const cacheReadEntries = dynamicSummary.secondaryEntries.filter(
      (entry) => entry.field === 'cacheReadPrice' && entry.unit === 'token'
    )
    const fixedTierRows =
      dynamicSummary.isTaskUsage || dynamicSummary.isTimePricing
        ? []
        : dynamicSummary.tiers.flatMap((tier) => {
            const entry = getDynamicPriceEntries(tier, dynamicPriceOptions)[0]
            return entry?.key === 'fixed' ? [{ label: tier.label, entry }] : []
          })
    if (dynamicSummary.isSpecialExpression) {
      priceSummary = (
        <div className='col-span-full min-w-0'>
          <span className='text-warning'>
            {t('Special billing expression')}
          </span>
          <code className='text-muted-foreground mt-1 line-clamp-2 block font-mono text-xs break-all'>
            {dynamicSummary.rawExpression}
          </code>
        </div>
      )
    } else if (
      fixedTierRows.length > 1 &&
      fixedTierRows.length === dynamicSummary.tiers.length
    ) {
      priceSummary = (
        <dl className='col-span-full grid gap-y-1'>
          {fixedTierRows.map((row) => (
            <div
              key={row.label}
              className='flex min-w-0 items-baseline justify-between gap-3'
            >
              <dt className='text-muted-foreground truncate text-xs'>
                {row.label}
              </dt>
              <dd className='shrink-0 font-mono text-sm font-semibold tabular-nums'>
                {row.entry.formatted}
                <span className='text-muted-foreground text-xs font-normal'>
                  {' '}
                  / {t(getDynamicPriceUnitLabelKey(row.entry) ?? 'request')}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )
    } else if (
      dynamicSummary.primaryEntries.length > 0 ||
      cacheReadEntries.length > 0
    ) {
      priceSummary = (
        <>
          {[
            dynamicSummary.primaryEntries.slice(
              0,
              dynamicSummary.providerCount ? 2 : undefined
            ),
            cacheReadEntries,
          ]
            .flat()
            .map((entry) => {
              const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
              const unitLabel = taskUsageUnitLabel(
                entry,
                i18n.language,
                unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
              )
              let label: ReactNode = null
              if (entry.labelKind !== 'schema') {
                label = t(entry.shortLabel)
              } else {
                label = taskPriceLabel(
                  entry.description,
                  entry.shortLabel,
                  i18n.language
                )
              }
              return (
                <div
                  key={entry.key}
                  className={cn(
                    'flex min-w-0 flex-col gap-1',
                    dynamicSummary.isTaskUsage && 'col-span-full'
                  )}
                >
                  {label && (
                    <span className='text-muted-foreground text-xs break-words whitespace-normal'>
                      {label}
                    </span>
                  )}
                  <span className='flex flex-wrap items-baseline gap-x-1 font-mono text-sm font-semibold tabular-nums'>
                    <span>{entry.formattedRange ?? entry.formatted}</span>
                    <span className='text-muted-foreground text-xs font-normal whitespace-nowrap'>
                      {' '}
                      / {unitLabel}
                    </span>
                  </span>
                </div>
              )
            })}
          {dynamicSummary.isTimePricing && (
            <span className='text-muted-foreground col-span-full text-xs'>
              {t('Current period price')}
            </span>
          )}
          {dynamicSummary.isMixedBilling && (
            <span className='text-muted-foreground col-span-full text-xs'>
              {t('Token or per-call pricing')}
            </span>
          )}
          {cardExamplePrice && (
            <span className='text-muted-foreground col-span-full text-xs break-words'>
              {cardExamplePrice.label} ≈ {cardExamplePrice.formatted}
            </span>
          )}
          {dynamicSummary.isTaskUsage &&
            dynamicSummary.tier?.label &&
            !dynamicSummary.primaryEntries.some(
              (entry) => entry.formattedRange
            ) && (
              <span className='text-muted-foreground col-span-full text-xs break-words'>
                ({dynamicSummary.tier.label})
              </span>
            )}
        </>
      )
    } else {
      priceSummary = (
        <span className='text-muted-foreground col-span-full'>
          {dynamicSummary.hasUnconfiguredProviders
            ? t('Usage-based billing · price not configured')
            : t('Dynamic Pricing')}
        </span>
      )
    }
  } else if (isUnconfiguredTaskUsage) {
    priceSummary = (
      <span className='text-muted-foreground col-span-full'>
        {t('Usage-based billing · price not configured')}
      </span>
    )
  } else if (isTokenBased) {
    const prices: { type: PriceType; label: string }[] = [
      { type: 'input', label: t('Input') },
      { type: 'output', label: t('Output') },
      ...(props.model.cache_ratio != null
        ? [{ type: 'cache' as const, label: t('Cached') }]
        : []),
    ]
    priceSummary = prices.map((price) => (
      <div key={price.type} className='flex min-w-0 flex-col gap-1'>
        <span className='text-muted-foreground text-xs'>{price.label}</span>
        <span className='font-mono text-sm font-semibold tabular-nums'>
          {formatPrice(
            props.model,
            price.type,
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
          <span className='text-muted-foreground text-xs font-normal'>
            {' '}
            / {tokenUnitLabel}
          </span>
        </span>
      </div>
    ))
  } else {
    priceSummary = (
      <p className='col-span-full flex min-w-0 flex-wrap items-end gap-x-2'>
        <span className='font-mono text-4xl leading-none font-bold tracking-tight tabular-nums'>
          {formatRequestPrice(
            props.model,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
        </span>
        <span className='text-muted-foreground pb-0.5 text-xs'>
          / {t('request')}
        </span>
      </p>
    )
  }

  return (
    <Card
      data-stable={stable || undefined}
      className={cn(
        'hover:border-brand/40 h-full min-w-0 gap-3',
        stable && 'border-success/40 hover:border-success/60 relative'
      )}
    >
      {stable && (
        <span
          aria-hidden
          data-stable-flow-border='true'
          className='auto-group-flow-border stable-card-flow-border pointer-events-none absolute inset-0 z-10'
        />
      )}
      <CardHeader className='flex flex-row items-center gap-3'>
        <div
          aria-hidden
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-lg',
            stable
              ? 'bg-success/10 text-success stable-card-icon-breath relative'
              : 'bg-brand-soft text-brand-hover dark:text-brand-on-dark',
            unavailable && 'opacity-50 grayscale'
          )}
        >
          {modelIcon || <span className='text-sm font-bold'>{initial}</span>}
          {stable && (
            <span
              data-stable-shield='true'
              className='bg-success text-success-foreground border-card absolute -right-1.5 -bottom-1.5 z-10 flex size-5 items-center justify-center rounded-full border-2'
            >
              <ShieldCheck className='size-3' />
            </span>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <h3
            className={cn(
              'line-clamp-2 font-mono text-lg leading-snug font-bold [overflow-wrap:anywhere]',
              unavailable && 'text-muted-foreground'
            )}
            title={props.model.model_name}
          >
            {modelDisplayName(props.model)}
            {stable && (
              <BadgeCheck
                role='img'
                aria-label={t('Stable')}
                className='text-success ml-1.5 inline-block size-[1.1em] -translate-y-px align-middle'
              >
                <title>{t('Stable')}</title>
              </BadgeCheck>
            )}
          </h3>
          {props.model.vendor_name && (
            <p
              className='text-muted-foreground mt-1 truncate text-xs'
              title={props.model.vendor_name}
            >
              {props.model.vendor_name}
            </p>
          )}
        </div>
        {unavailable && (
          <span className='bg-warning/15 text-warning flex shrink-0 items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-bold'>
            <CirclePause aria-hidden className='size-3' />
            {t('Temporarily unavailable')}
          </span>
        )}
        {!unavailable && headerBadges.length > 0 && (
          <ul
            aria-label={t('Highlights')}
            className='flex shrink-0 flex-wrap justify-end gap-1 self-start'
          >
            {headerBadges.map((badge) =>
              badge === 'recommended' ? (
                // An icon reads the same in every language; the label stays
                // available to screen readers and as a tooltip.
                <li
                  key={badge}
                  aria-label={modelBadgeLabel(badge, t)}
                  title={modelBadgeLabel(badge, t)}
                  className={cn(
                    'flex size-5 items-center justify-center rounded-md',
                    MODEL_BADGE_CLASSES[badge]
                  )}
                >
                  <ThumbsUp
                    aria-hidden='true'
                    className='recommended-badge-pop size-3.5 fill-current'
                  />
                </li>
              ) : (
                <li
                  key={badge}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-bold tracking-wide',
                    MODEL_BADGE_CLASSES[badge]
                  )}
                >
                  {modelBadgeLabel(badge, t)}
                </li>
              )
            )}
          </ul>
        )}
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-3'>
        <div className='flex min-w-0 flex-col gap-1.5'>
          <p className='text-muted-foreground line-clamp-2 text-[13px] leading-5 break-words'>
            {props.model.description || t('No description available.')}
          </p>
          {tags.length > 0 && (
            <div
              role='group'
              aria-label={t('Tags')}
              className='text-muted-foreground flex min-w-0 items-baseline gap-1.5 text-xs'
            >
              <span className='shrink-0'>{t('Tags')}</span>
              <span className='truncate' title={tags.join(', ')}>
                {tags.slice(0, 2).join(', ')}
              </span>
              {tags.length > 2 && (
                <span className='shrink-0' title={tags.slice(2).join(', ')}>
                  +{tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
        <div
          role='group'
          aria-label={t('Pricing')}
          className={cn(
            'flex min-w-0 flex-col gap-1.5',
            unavailable && 'opacity-50'
          )}
        >
          <ModelBillingModeBadge model={props.model} appearance='caption' />
          {dynamicSummary?.providerCount && (
            <span className='text-muted-foreground text-xs break-words'>
              {t('{{count}} providers', {
                count: dynamicSummary.providerCount,
              })}
              {dynamicSummary.hasUnconfiguredProviders &&
                ` · ${t('Not configured for some providers')}`}
            </span>
          )}
          <div className='grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-x-3 gap-y-2'>
            {priceSummary}
          </div>
        </div>
        {unavailable && (
          <p
            role='status'
            className='bg-warning/10 text-warning rounded-md px-2.5 py-1.5 text-xs leading-5 break-words'
          >
            {unavailableNote}
          </p>
        )}
        {(groups.length > 0 || endpoints.length > 0) && (
          <dl
            className={cn(
              'mt-auto grid min-w-0 grid-cols-2 gap-3 text-xs',
              (groups.length === 0 || endpoints.length === 0) && 'grid-cols-1'
            )}
          >
            {groups.length > 0 && (
              <div className='flex min-w-0 items-baseline gap-1.5'>
                <dt className='text-muted-foreground shrink-0'>
                  {t('Groups')}
                </dt>
                <dd className='flex min-w-0 items-baseline gap-1'>
                  <span className='truncate' title={groups.join(', ')}>
                    {groups[0]}
                  </span>
                  {groups.length > 1 && (
                    <span
                      className='text-muted-foreground shrink-0'
                      title={groups.slice(1).join(', ')}
                    >
                      +{groups.length - 1}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {endpoints.length > 0 && (
              <div className='flex min-w-0 items-baseline gap-1.5'>
                <dt className='text-muted-foreground shrink-0'>
                  {t('Endpoints')}
                </dt>
                <dd className='flex min-w-0 items-baseline gap-1'>
                  <span className='truncate' title={endpoints.join(', ')}>
                    {endpoints.slice(0, 2).join(', ')}
                  </span>
                  {endpoints.length > 2 && (
                    <span
                      className='text-muted-foreground shrink-0'
                      title={endpoints.slice(2).join(', ')}
                    >
                      +{endpoints.length - 2}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
      </CardContent>
      <CardFooter className='border-border mt-auto w-full rounded-none border-t-[1.5px] bg-transparent p-0'>
        <div
          role='group'
          aria-label={t('Actions')}
          className='flex w-full self-stretch'
        >
          {showTry && (
            <Button
              variant='ghost'
              disabled={unavailable}
              title={unavailable ? unavailableNote : undefined}
              onClick={() =>
                tryKind && props.onTry?.(props.model.model_name || '', tryKind)
              }
              className='hover:bg-muted h-auto min-h-11 flex-1 rounded-none px-4 font-bold'
            >
              <Play aria-hidden className='size-4' />
              {t('Try')}
            </Button>
          )}
          <Button
            variant='ghost'
            onClick={() => props.onClick(props.model.model_name || '')}
            className={cn(
              'h-auto min-h-11 flex-1 rounded-none px-5 font-bold',
              stable
                ? 'hover:bg-success/90 hover:text-success-foreground'
                : 'hover:bg-brand-hover hover:text-white',
              showTry && 'border-border border-l-[1.5px]',
              accentClass
            )}
          >
            {t('Details')}
            <ChevronRight aria-hidden className='size-4' />
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
})
