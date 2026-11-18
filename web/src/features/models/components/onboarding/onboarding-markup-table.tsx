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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ModelPricingEntry } from '@/features/model-pricing/api'
import { taskTierConditions } from '@/features/pricing/lib/task-price-display'
import type { PricingCategory } from '@/features/pricing/types'
import { getCurrencyDisplay } from '@/lib/currency'
import { formatPercent } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { setModelGroupRatios, setPriceMarkup } from '../../api'
import {
  batchAdjustment,
  FIXED_PRICE_ROW,
  fixedPriceRows,
  markupRows,
  officialSecondPrice,
  onboardingOfficialPricing,
  referenceTier,
  tierMarkups,
  type BatchOperation,
  type MarkupRow,
} from '../../lib/onboarding-markup'
import { modelsQueryKeys } from '../../lib/query-keys'
import type { OnboardingMarkup } from '../../types'
import { OnboardingMarkupBatch } from './onboarding-markup-batch'

// The server bounds a model's own group ratio.
const MAX_MODEL_GROUP_RATIO = 100

// The server bounds one adjustment, in USD per second or per request, either
// way.
const MAX_ADJUSTMENT = 1000

/**
 * Supplier, group-ratio, adjustment and final price per second of each tier,
 * or per image of a fixed-price model.
 * The adjustment is a fixed amount customers pay on top of the group-ratio
 * price, or below it when negative; the server folds it into the charged
 * expression. A final price under the supply price is flagged but allowed.
 * The prices of another group follow its ratio: the stored price is the
 * default-group final price divided by the price factor, so the adjustment
 * scales with the group's ratio too. Each row also shows the profit over the
 * supply price and the final price as a share of the official price.
 * Admin only: it shows supply prices.
 */
export function OnboardingMarkupTable(props: {
  entry: ModelPricingEntry
  markup: OnboardingMarkup | undefined
  priceFactor: number
  /** Every group's ratio, keyed by group name. */
  groupRatios: Record<string, number>
  /** Group ratios this model has of its own, replacing the group's. */
  modelGroupRatios?: Record<string, number>
  categories: PricingCategory[]
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  useSystemConfigStore((s) => s.config.currency)
  const { meta } = getCurrencyDisplay()
  const symbol = meta.kind === 'tokens' ? '$' : meta.symbol
  const rate = meta.kind === 'tokens' ? 1 : meta.exchangeRate
  const language = i18n.resolvedLanguage || i18n.language

  const configured = props.entry.configured['billing_setting.billing_expr']
  const baseExpr =
    props.markup?.base_expr ??
    (typeof configured === 'string' ? configured : undefined)
  const examples =
    props.entry.usage_examples ??
    props.entry.plugin_variants?.[0]?.usage_examples
  const rows = useMemo(() => {
    const tiers = markupRows(baseExpr, props.entry.usage_schema, examples)
    if (tiers.length > 0) return tiers
    return fixedPriceRows(props.entry.configured, props.markup?.base_price)
  }, [
    baseExpr,
    props.entry.usage_schema,
    examples,
    props.entry.configured,
    props.markup?.base_price,
  ])
  const perImage = rows.length === 1 && rows[0].tier === FIXED_PRICE_ROW
  const official = useMemo(
    () =>
      onboardingOfficialPricing(
        props.entry.model_name,
        props.entry.configured['billing_setting.official_price_expr'],
        props.entry.usage_schema,
        examples,
        props.categories
      ),
    [
      props.entry.model_name,
      props.entry.configured,
      props.entry.usage_schema,
      examples,
      props.categories,
    ]
  )
  const groups = Object.keys(props.groupRatios).sort()
  const ownRatios = props.modelGroupRatios ?? {}
  const ratioOf = (name: string) => ownRatios[name] ?? props.groupRatios[name]
  // The price factor is the default group's ratio, else the lowest one.
  const factorGroup =
    props.groupRatios.default === props.priceFactor
      ? 'default'
      : groups.find((name) => props.groupRatios[name] === props.priceFactor)
  const [pickedGroup, setPickedGroup] = useState<string>()
  const group =
    pickedGroup && pickedGroup in props.groupRatios ? pickedGroup : factorGroup
  // This model's own ratio for the shown group, as display text.
  const savedOwnRatio =
    group !== undefined && ownRatios[group] !== undefined
      ? String(ownRatios[group])
      : ''
  const [ownRatioText, setOwnRatioText] = useState(savedOwnRatio)
  useEffect(() => setOwnRatioText(savedOwnRatio), [savedOwnRatio])
  const [targetShareText, setTargetShareText] = useState('')
  const ownRatioValue = Number(ownRatioText.trim())
  const ownRatioInvalid =
    ownRatioText.trim() !== '' &&
    (!Number.isFinite(ownRatioValue) ||
      ownRatioValue < 0 ||
      ownRatioValue > MAX_MODEL_GROUP_RATIO)
  // A valid unsaved ratio previews its prices.
  const draftRatio =
    ownRatioText.trim() !== '' && !ownRatioInvalid ? ownRatioValue : undefined
  const groupRatio =
    group === undefined ? props.priceFactor : (draftRatio ?? ratioOf(group))
  const groupScale = groupRatio / props.priceFactor
  const unit = perImage ? t('image') : t('s')

  // Inputs hold display-currency text; saved markups are USD.
  const savedText = useMemo(() => {
    const text: Record<string, string> = {}
    for (const [tier, markup] of Object.entries(props.markup?.tiers ?? {})) {
      text[tier] = String(Number((markup.per_second * rate).toFixed(6)))
    }
    const perRequest = props.markup?.per_request
    if (perRequest) {
      text[FIXED_PRICE_ROW] = String(Number((perRequest * rate).toFixed(6)))
    }
    return text
  }, [props.markup, rate])
  const [draft, setDraft] = useState(savedText)
  useEffect(() => setDraft(savedText), [savedText])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const amounts: Record<string, number> = {}
  const badInput = new Set<string>()
  const notPositive = new Set<string>()
  for (const row of rows) {
    const text = draft[row.tier]?.trim() ?? ''
    if (!text) continue
    const value = Number(text) / rate
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ADJUSTMENT) {
      badInput.add(row.tier)
      continue
    }
    amounts[row.tier] = value
    if (row.supply * props.priceFactor + value <= 0) notPositive.add(row.tier)
  }
  const invalid = badInput.size > 0 || notPositive.size > 0
  const dirty = rows.some(
    (row) => (draft[row.tier]?.trim() ?? '') !== (savedText[row.tier] ?? '')
  )

  const saveOwnRatio = useMutation({
    mutationFn: async (ratio: number | null) => {
      const ratios = { ...ownRatios }
      if (group === undefined) return undefined
      if (ratio === null) delete ratios[group]
      else ratios[group] = ratio
      return requireServerSuccess(
        await setModelGroupRatios({
          model_name: props.entry.model_name,
          ratios,
        })
      ).data
    },
    onSuccess: async (report) => {
      if (report) {
        queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report)
      }
      await queryClient.invalidateQueries({ queryKey: ['pricing'] })
      toast.success(t('Model group ratio saved'))
    },
  })

  const save = useMutation({
    mutationFn: async () =>
      requireServerSuccess(
        await setPriceMarkup(
          perImage
            ? {
                model_name: props.entry.model_name,
                per_request: amounts[FIXED_PRICE_ROW] ?? 0,
              }
            : {
                model_name: props.entry.model_name,
                tiers: tierMarkups(rows, amounts),
              }
        )
      ).data,
    onSuccess: async (report) => {
      queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report)
      await queryClient.invalidateQueries({
        queryKey: ['model-pricing-config'],
      })
      toast.success(t('Price adjustments saved'))
    },
  })

  if (rows.length === 0) return null
  const price = (usd: number) => `${symbol}${(usd * rate).toFixed(4)}/${unit}`
  const groupFinal = (row: MarkupRow) =>
    (row.supply * props.priceFactor + (amounts[row.tier] ?? 0)) * groupScale
  const inScope = (onlySelected: boolean) =>
    rows.filter((row) => !onlySelected || selected.has(row.tier))
  const applyBatch = (
    operation: BatchOperation,
    value: number,
    onlySelected: boolean
  ) => {
    const next = { ...draft }
    for (const row of inScope(onlySelected)) {
      const ratioPrice = row.supply * props.priceFactor * rate
      const amount = batchAdjustment(operation, value, ratioPrice)
      next[row.tier] = amount === 0 ? '' : String(amount)
    }
    setDraft(next)
  }
  // The ratio that puts this group's final price at the target share of the
  // official price, averaged over the tiers with an official price.
  const ratioForShare = (share: number) => {
    const ratios = rows.flatMap((row) => {
      const officialPrice = officialSecondPrice(row, official)
      const atFactor = row.supply * props.priceFactor + (amounts[row.tier] ?? 0)
      if (!officialPrice || atFactor <= 0) return []
      return [(share * officialPrice * props.priceFactor) / atFactor]
    })
    if (ratios.length === 0) return undefined
    const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
    return Number(mean.toFixed(6))
  }
  const fillRatioFromShare = () => {
    const share = Number(targetShareText.trim()) / 100
    if (!Number.isFinite(share) || share <= 0) return
    const ratio = ratioForShare(share)
    if (ratio !== undefined) setOwnRatioText(String(ratio))
  }
  const clearBatch = (onlySelected: boolean) => {
    const next = { ...draft }
    for (const row of inScope(onlySelected)) next[row.tier] = ''
    setDraft(next)
  }
  const toggleRow = (tier: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(tier)
      else next.delete(tier)
      return next
    })
  const allSelected = rows.every((row) => selected.has(row.tier))
  const columns: StaticDataTableColumn<MarkupRow>[] = [
    {
      id: 'select',
      header: (
        <Checkbox
          aria-label={t('Select all tiers')}
          checked={allSelected}
          indeterminate={selected.size > 0 && !allSelected}
          onCheckedChange={(checked) =>
            setSelected(
              checked ? new Set(rows.map((row) => row.tier)) : new Set()
            )
          }
        />
      ),
      cell: (row) => (
        <Checkbox
          aria-label={t('Select {{tier}}', { tier: row.tier })}
          checked={selected.has(row.tier)}
          onCheckedChange={(checked) => toggleRow(row.tier, checked)}
        />
      ),
    },
    {
      id: 'condition',
      header: t('Conditions'),
      cell: (row) => (
        <div className='space-y-0.5'>
          <div>
            {row.source
              ? taskTierConditions(
                  row.source,
                  props.entry.usage_schema,
                  language,
                  t
                ) || row.tier
              : t('Per image')}
          </div>
          {row.reference && (
            <div className='text-muted-foreground text-xs'>
              {t('Per second of output plus reference video')}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'supply',
      header: t('Supply price'),
      cellClassName: 'font-mono',
      cell: (row) => price(row.supply),
    },
    {
      id: 'ratio',
      header: t('Group ratio price (×{{ratio}})', { ratio: groupRatio }),
      cellClassName: 'font-mono',
      cell: (row) => price(row.supply * groupRatio),
    },
    {
      id: 'markup',
      header: t('Price adjustment'),
      cell: (row) => (
        <InputGroup className='w-36'>
          <InputGroupAddon>
            <InputGroupText>{symbol}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            inputMode='decimal'
            aria-label={
              perImage
                ? t('Price adjustment per image')
                : t('Price adjustment per second for {{tier}}', {
                    tier: row.tier,
                  })
            }
            aria-invalid={badInput.has(row.tier) || notPositive.has(row.tier)}
            className={
              (amounts[row.tier] ?? 0) < 0
                ? 'text-green-600 dark:text-green-500'
                : undefined
            }
            placeholder='0'
            value={draft[row.tier] ?? ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                [row.tier]: event.target.value,
              }))
            }
          />
          <InputGroupAddon align='inline-end'>
            <InputGroupText>/{unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ),
    },
    {
      id: 'final',
      header: t('Final price'),
      cellClassName: 'font-mono font-medium',
      cell: (row) => {
        const final = groupFinal(row)
        if (final >= row.supply) return price(final)
        return (
          <div className='text-destructive space-y-0.5'>
            <div>{price(final)}</div>
            <div className='font-sans text-xs font-normal'>
              {final > 0 ? t('Below supply price') : t('Must be above 0')}
            </div>
          </div>
        )
      },
    },
    {
      id: 'profit',
      header: perImage ? t('Profit per image') : t('Profit per second'),
      cellClassName: 'font-mono',
      cell: (row) => {
        const profit = groupFinal(row) - row.supply
        return (
          <span
            className={
              profit < 0
                ? 'text-destructive'
                : 'text-green-600 dark:text-green-500'
            }
          >
            {price(profit)}
          </span>
        )
      },
    },
    {
      id: 'margin',
      header: t('Gross margin'),
      cellClassName: 'font-mono',
      cell: (row) => {
        const final = groupFinal(row)
        if (final <= 0) return <span className='text-muted-foreground'>—</span>
        const margin = (final - row.supply) / final
        return (
          <span
            className={
              margin < 0
                ? 'text-destructive'
                : 'text-green-600 dark:text-green-500'
            }
          >
            {formatPercent(margin * 100)}
          </span>
        )
      },
    },
    {
      id: 'official',
      header: t('Share of official price'),
      cell: (row) => {
        const officialPrice = officialSecondPrice(row, official)
        if (!officialPrice) {
          const outputSecondsOnly =
            official &&
            row.source &&
            !row.tokensPerSecond &&
            referenceTier(row.source)
          return (
            <div className='text-muted-foreground space-y-0.5'>
              <div>—</div>
              {outputSecondsOnly && (
                <div className='text-xs'>
                  {t(
                    'Official pricing also bills reference video seconds, so it does not compare per output second'
                  )}
                </div>
              )}
            </div>
          )
        }
        const share = groupFinal(row) / officialPrice
        return (
          <div className='space-y-0.5'>
            <div className='font-medium'>
              {t('{{percent}}% of official', {
                percent: Number((share * 100).toFixed(1)),
                discount: Number((share * 10).toFixed(2)),
              })}
            </div>
            <div className='text-muted-foreground font-mono text-xs'>
              {t('Official {{price}}', { price: price(officialPrice) })}
            </div>
          </div>
        )
      },
    },
  ]

  let footnote = t(
    'Prices are per second of output video. A negative adjustment lowers the price. Customers pay the final price; a new group ratio keeps the adjustment unchanged.'
  )
  if (perImage) {
    footnote = t(
      'Customers pay the final price for each image. A negative adjustment lowers the price; a new group ratio keeps the adjustment unchanged.'
    )
  } else if (rows.some((row) => row.tokensPerSecond)) {
    footnote = t(
      'Token prices are shown per second of video at each resolution. With reference videos, the adjustment applies to output and reference seconds alike. A negative adjustment lowers the price. Customers pay the final price; a new group ratio keeps the adjustment unchanged.'
    )
  }

  return (
    <section className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h4 className='text-sm font-medium'>
          {perImage ? t('Price per image') : t('Price per second')}
        </h4>
        {groups.length > 1 && (
          <Select
            value={group ?? null}
            items={groups.map((name) => ({
              value: name,
              label: `${name} ×${ratioOf(name)}`,
            }))}
            onValueChange={(value) => {
              if (value) setPickedGroup(value)
            }}
          >
            <SelectTrigger size='sm' className='w-48' aria-label={t('Group')}>
              <SelectValue placeholder={t('Group')} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((name) => (
                <SelectItem key={name} value={name}>
                  {name} ×{ratioOf(name)}
                  {ownRatios[name] !== undefined && ` (${t('This model')})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {group !== undefined && (
        <div className='bg-muted/30 flex flex-wrap items-end gap-2 rounded-md border p-2'>
          <label className='space-y-1 text-xs'>
            <span className='text-muted-foreground block'>
              {t("This model's ratio in {{group}}", { group })}
            </span>
            <Input
              inputMode='decimal'
              className='h-8 w-28 font-mono'
              aria-invalid={ownRatioInvalid}
              placeholder={String(props.groupRatios[group])}
              value={ownRatioText}
              onChange={(event) => setOwnRatioText(event.target.value)}
            />
          </label>
          <label className='space-y-1 text-xs'>
            <span className='text-muted-foreground block'>
              {t('Target share of official price (%)')}
            </span>
            <div className='flex gap-1'>
              <Input
                inputMode='decimal'
                className='h-8 w-20 font-mono'
                placeholder='83'
                value={targetShareText}
                onChange={(event) => setTargetShareText(event.target.value)}
              />
              <Button
                size='sm'
                variant='outline'
                disabled={!official || !targetShareText.trim()}
                onClick={fillRatioFromShare}
              >
                {t('Calculate ratio')}
              </Button>
            </div>
          </label>
          <Button
            size='sm'
            disabled={
              ownRatioInvalid ||
              ownRatioText.trim() === '' ||
              ownRatioText.trim() === savedOwnRatio ||
              saveOwnRatio.isPending
            }
            onClick={() => saveOwnRatio.mutate(ownRatioValue)}
          >
            {t('Save model ratio')}
          </Button>
          {ownRatios[group] !== undefined && (
            <Button
              size='sm'
              variant='ghost'
              disabled={saveOwnRatio.isPending}
              onClick={() => saveOwnRatio.mutate(null)}
            >
              {t('Use group ratio')}
            </Button>
          )}
          <p className='text-muted-foreground basis-full text-xs'>
            {t(
              'Applies to this model in this group only and replaces the group ratio ×{{ratio}}. Empty uses the group ratio. Prices below preview the ratio before saving.',
              { ratio: props.groupRatios[group] }
            )}
          </p>
        </div>
      )}
      <OnboardingMarkupBatch
        symbol={symbol}
        unit={unit}
        selectedCount={selected.size}
        onApply={applyBatch}
        onClear={clearBatch}
      />
      <StaticDataTable
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={rows}
        getRowKey={(row) => row.tier}
        columns={columns}
      />
      <p className='text-muted-foreground text-xs'>{footnote}</p>
      {group !== factorGroup && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Adjustments are entered for the {{base}} group; the {{group}} group pays them scaled by its ratio.',
            { base: factorGroup ?? 'default', group }
          )}
        </p>
      )}
      {badInput.size > 0 && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Enter a valid adjustment amount')}
        </p>
      )}
      {notPositive.size > 0 && (
        <p role='alert' className='text-destructive text-sm'>
          {t('The final price must stay above 0')}
        </p>
      )}
      <div className='flex justify-end'>
        <Button
          size='sm'
          disabled={!dirty || invalid || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t('Saving...') : t('Save price adjustments')}
        </Button>
      </div>
    </section>
  )
}
