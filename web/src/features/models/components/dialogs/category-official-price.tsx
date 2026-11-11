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
  officialDraftError,
  officialDraftFromExpr,
  officialExprFromDraft,
  type OfficialPriceDraft,
} from '@/features/pricing/lib/official-price'

/**
 * The official price of a category, entered the way the pricing page shows
 * its models' prices. Models of the category without an official price of
 * their own show this one.
 */
export function CategoryOfficialPrice(props: {
  models: string[]
  value: string
  onChange: (expression: string) => void
  /** Called with true while the entered prices cannot be saved. */
  onBlockedChange: (blocked: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const query = useModelPricing(props.models, props.models.length > 0)
  const result = useMemo(() => {
    const entries = query.data?.entries ?? []
    return categoryOfficialLayout(
      props.models.flatMap((name) => {
        const entry = entries.find((item) => item.model_name === name)
        return entry ? [modelPricingDisplay(entry)] : []
      })
    )
  }, [query.data, props.models])
  const layout = result.layout
  const [draft, setDraft] = useState<OfficialPriceDraft | null>(null)
  const [readable, setReadable] = useState(true)
  const value = useRef(props.value)
  value.current = props.value

  // Rebuild the form when the layout changes; the saved value stays until the
  // administrator edits a price.
  useEffect(() => {
    if (!layout) {
      setDraft(null)
      return
    }
    const parsed = officialDraftFromExpr(layout, value.current)
    setReadable(parsed !== null)
    setDraft(parsed ?? officialDraftFromExpr(layout, ''))
  }, [layout])

  const { onBlockedChange } = props
  const blocked = draft !== null && officialDraftError(draft) !== null
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
      </div>
      {query.isLoading && <LoadingState />}
      {!query.isLoading && !layout && (
        <p role='status' className='text-xs text-amber-600'>
          {t(
            'One official price can only be set when every model is priced the same way: per second with the same resolutions, or per token. Models that differ: {{models}}',
            { models: result.conflicts.join(', ') }
          )}
        </p>
      )}
      {layout && !readable && props.value && (
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
          onChange={(next) => {
            setDraft(next)
            setReadable(true)
            props.onChange(officialExprFromDraft(layout, next))
          }}
        />
      )}
      {props.value && (
        <div className='flex justify-end'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.disabled}
            onClick={() => {
              props.onChange('')
              setReadable(true)
              if (layout) setDraft(officialDraftFromExpr(layout, ''))
            }}
          >
            {t('Remove official price')}
          </Button>
        </div>
      )}
    </section>
  )
}
