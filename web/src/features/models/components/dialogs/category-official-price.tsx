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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { useModelPricing } from '@/features/model-pricing/api'
import { OfficialPriceFields } from '@/features/model-pricing/official-price-fields'
import { modelPricingDisplay } from '@/features/model-pricing/pricing'
import {
  categoryOfficialLayout,
  emptyOfficialDraft,
  officialDraftError,
  officialDraftFromTable,
  officialTableFromDraft,
  parseTokenOfficialPrice,
  type OfficialPriceDraft,
} from '@/features/pricing/lib/official-price'
import { getOfficialVideoPricing } from '@/features/pricing/lib/video-pricing'
import type { OfficialPriceTable, PricingModel } from '@/features/pricing/types'

/**
 * Reads an official price saved as an expression before categories stored a
 * table, using the models it was written for.
 */
function legacyOfficialTable(
  expression: string,
  models: PricingModel[]
): OfficialPriceTable | null {
  const token = parseTokenOfficialPrice(expression)
  if (token) return officialTableFromDraft(token)
  for (const model of models) {
    const pricing = getOfficialVideoPricing({
      ...model,
      official_price_expr: expression,
    })
    if (!pricing) continue
    return {
      kind: 'video',
      rows: pricing.rows.map((row) => ({
        option: row.option,
        second: row.secondPrice,
        ...(row.referenceSecondPrice
          ? { reference_second: row.referenceSecondPrice }
          : {}),
      })),
    }
  }
  return null
}

/**
 * The official price of a category, entered the way the pricing page shows
 * its models' prices: one per-second table over every resolution of its video
 * models, or one per-1M-token price. Models of the category without an
 * official price of their own show the rows they support.
 */
export function CategoryOfficialPrice(props: {
  models: string[]
  value: OfficialPriceTable | null
  /** Official price saved as an expression by an earlier version. */
  legacyExpression?: string
  onChange: (table: OfficialPriceTable | null) => void
  /** Called with true while the entered prices cannot be saved. */
  onBlockedChange: (blocked: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const query = useModelPricing(props.models, props.models.length > 0)
  const models = useMemo(() => {
    const entries = query.data?.entries ?? []
    return props.models.flatMap((name) => {
      const entry = entries.find((item) => item.model_name === name)
      return entry ? [modelPricingDisplay(entry)] : []
    })
  }, [query.data, props.models])
  const result = useMemo(() => categoryOfficialLayout(models), [models])
  const layout = result.layout
  const [draft, setDraft] = useState<OfficialPriceDraft | null>(null)
  const [readable, setReadable] = useState(true)
  const latest = useRef(props)
  latest.current = props

  // Rebuild the form when the layout changes; the saved table stays until the
  // administrator edits a price.
  useEffect(() => {
    if (!layout) {
      setDraft(null)
      return
    }
    const current = latest.current
    let table = current.value
    if (!table && current.legacyExpression) {
      table = legacyOfficialTable(current.legacyExpression, models)
      // Saving the category stores the price as a table from now on.
      if (table) current.onChange(table)
    }
    const parsed = table ? officialDraftFromTable(layout, table) : null
    setReadable(table ? parsed !== null : !current.legacyExpression?.trim())
    setDraft(parsed ?? emptyOfficialDraft(layout))
  }, [layout, models])

  const { onBlockedChange } = props
  const blocked =
    draft !== null &&
    officialDraftError(draft, { allowBlankRows: true }) !== null
  useEffect(() => {
    onBlockedChange(blocked)
  }, [blocked, onBlockedChange])

  if (props.models.length === 0) return null

  return (
    <section
      aria-label={t('Official Price')}
      className='space-y-3 rounded-lg border p-3'
    >
      <div className='space-y-1'>
        <h3 className='text-sm font-medium'>{t('Official Price')}</h3>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Models of this category show it when they have no official price of their own. It is never charged.'
          )}
        </p>
        {layout?.kind === 'video' && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Each model shows the resolutions it supports. Leave a resolution empty to hide it.'
            )}
          </p>
        )}
        {layout?.kind === 'video' && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Chinese interfaces show the CNY price where one is set; other languages show the USD price.'
            )}
          </p>
        )}
      </div>
      {query.isLoading && <LoadingState />}
      {!query.isLoading && !layout && (
        <p role='status' className='text-xs text-amber-600'>
          {t(
            'One official price needs every model shown the same way: all per second, or all per token. Models shown differently: {{models}}',
            { models: result.conflicts.join(', ') }
          )}
        </p>
      )}
      {layout && !readable && (
        <p role='status' className='text-xs text-amber-600'>
          {t(
            'The saved official price cannot be shown in this form. Saving replaces it.'
          )}
        </p>
      )}
      {layout && draft && (
        <OfficialPriceFields
          layout={layout}
          draft={draft}
          disabled={props.disabled}
          idPrefix='category-official-price'
          allowBlankRows
          cny
          onChange={(next) => {
            setDraft(next)
            setReadable(true)
            props.onChange(officialTableFromDraft(next))
          }}
        />
      )}
      {(props.value || props.legacyExpression) && (
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.disabled}
            onClick={() => {
              props.onChange(null)
              setReadable(true)
              if (layout) setDraft(emptyOfficialDraft(layout))
            }}
          >
            {t('Remove official price')}
          </Button>
        </div>
      )}
    </section>
  )
}
