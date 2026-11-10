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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import type { ModelPricingEntry } from '@/features/model-pricing/api'
import { taskTierConditions } from '@/features/pricing/lib/task-price-display'
import { getCurrencyDisplay } from '@/lib/currency'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { setPriceMarkup } from '../../api'
import {
  markupRows,
  tierMarkups,
  type MarkupRow,
} from '../../lib/onboarding-markup'
import { modelsQueryKeys } from '../../lib/query-keys'
import type { OnboardingMarkup } from '../../types'

/**
 * Supplier, group-ratio, markup and final price per second of each tier. The
 * markup is a fixed amount customers pay on top of the group-ratio price; the
 * server folds it into the charged expression. Admin only: it shows supply
 * prices.
 */
export function OnboardingMarkupTable(props: {
  entry: ModelPricingEntry
  markup: OnboardingMarkup | undefined
  priceFactor: number
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
  const examples = props.entry.plugin_variants?.[0]?.usage_examples
  const rows = useMemo(
    () => markupRows(baseExpr, props.entry.usage_schema, examples),
    [baseExpr, props.entry.usage_schema, examples]
  )

  // Inputs hold display-currency text; saved markups are USD.
  const savedText = useMemo(() => {
    const text: Record<string, string> = {}
    for (const [tier, markup] of Object.entries(props.markup?.tiers ?? {})) {
      text[tier] = String(Number((markup.per_second * rate).toFixed(6)))
    }
    return text
  }, [props.markup, rate])
  const [draft, setDraft] = useState(savedText)
  useEffect(() => setDraft(savedText), [savedText])

  const amounts: Record<string, number> = {}
  let invalid = false
  for (const row of rows) {
    const text = draft[row.tier]?.trim() ?? ''
    if (!text) continue
    const value = Number(text)
    if (!Number.isFinite(value) || value < 0) invalid = true
    else amounts[row.tier] = value / rate
  }
  const dirty = rows.some(
    (row) => (draft[row.tier]?.trim() ?? '') !== (savedText[row.tier] ?? '')
  )

  const save = useMutation({
    mutationFn: async () =>
      requireServerSuccess(
        await setPriceMarkup({
          model_name: props.entry.model_name,
          tiers: tierMarkups(rows, amounts),
        })
      ).data,
    onSuccess: async (report) => {
      queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report)
      await queryClient.invalidateQueries({
        queryKey: ['model-pricing-config'],
      })
      toast.success(t('Markup saved'))
    },
  })

  if (rows.length === 0) return null
  const price = (usd: number) => `${symbol}${(usd * rate).toFixed(4)}/${t('s')}`
  const columns: StaticDataTableColumn<MarkupRow>[] = [
    {
      id: 'condition',
      header: t('Conditions'),
      cell: (row) =>
        taskTierConditions(row.source, props.entry.usage_schema, language, t) ||
        row.tier,
    },
    {
      id: 'supply',
      header: t('Supply price'),
      cellClassName: 'font-mono',
      cell: (row) => price(row.supply),
    },
    {
      id: 'ratio',
      header: t('Group ratio price (×{{ratio}})', { ratio: props.priceFactor }),
      cellClassName: 'font-mono',
      cell: (row) => price(row.supply * props.priceFactor),
    },
    {
      id: 'markup',
      header: t('Extra markup'),
      cell: (row) => (
        <InputGroup className='w-36'>
          <InputGroupAddon>
            <InputGroupText>{symbol}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            inputMode='decimal'
            aria-label={t('Extra markup per second for {{tier}}', {
              tier: row.tier,
            })}
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
            <InputGroupText>/{t('s')}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ),
    },
    {
      id: 'final',
      header: t('Final price'),
      cellClassName: 'font-mono font-medium',
      cell: (row) =>
        price(row.supply * props.priceFactor + (amounts[row.tier] ?? 0)),
    },
  ]

  return (
    <section className='space-y-2'>
      <h4 className='text-sm font-medium'>{t('Price per second')}</h4>
      <StaticDataTable
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={rows}
        getRowKey={(row) => row.tier}
        columns={columns}
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          'Token prices are shown per second of video at each resolution. With reference videos, the markup is charged on output and reference seconds alike. Customers pay the final price; a new group ratio keeps the markup unchanged.'
        )}
      </p>
      {invalid && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Enter a markup of 0 or more')}
        </p>
      )}
      <div className='flex justify-end'>
        <Button
          size='sm'
          disabled={!dirty || invalid || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t('Saving...') : t('Save markup')}
        </Button>
      </div>
    </section>
  )
}
