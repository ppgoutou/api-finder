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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  PRICING_CATEGORIES_OPTION_KEY,
  parsePricingCategories,
} from '@/features/models/lib/pricing-categories'
import {
  officialDraftError,
  officialDraftFromExpr,
  officialDraftFromTable,
  officialExprFromDraft,
  officialPriceLayout,
  type OfficialPriceDraft,
} from '@/features/pricing/lib/official-price'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'
import { handleServerError } from '@/lib/handle-server-error'

import { useModelPricing, useSaveOfficialPrice } from './api'
import { OfficialPriceFields } from './official-price-fields'
import { modelPricingDisplay } from './pricing'

const OFFICIAL_PRICE_KEY = 'billing_setting.official_price_expr'

/**
 * Edits the vendor's published price that the pricing page shows above the
 * group prices. It is saved on its own and never affects what is charged. A
 * model's own official price takes precedence over its category's.
 */
export function OfficialPriceEditor(props: { modelName: string }) {
  const { t } = useTranslation()
  const query = useModelPricing([props.modelName], Boolean(props.modelName))
  const options = useSystemOptions()
  const save = useSaveOfficialPrice()
  const entry = query.data?.entries.find(
    (item) => item.model_name === props.modelName
  )
  const own = String(entry?.configured[OFFICIAL_PRICE_KEY] ?? '')
  const category = useMemo(() => {
    // Categories are optional context: an unreadable option list means none.
    const list = options.data?.data
    const stored = Array.isArray(list)
      ? list.find((option) => option.key === PRICING_CATEGORIES_OPTION_KEY)
          ?.value
      : undefined
    return parsePricingCategories(stored).find(
      (item) =>
        item.models.includes(props.modelName) &&
        (item.official_price || item.official_price_expr)
    )
  }, [options.data, props.modelName])
  const layout = useMemo(
    () => (entry ? officialPriceLayout(modelPricingDisplay(entry)) : null),
    [entry]
  )
  const inheritedDraft = useMemo(() => {
    if (!layout || !category) return null
    if (category.official_price) {
      return officialDraftFromTable(layout, category.official_price)
    }
    return officialDraftFromExpr(layout, category.official_price_expr)
  }, [layout, category])
  const inherited =
    layout && inheritedDraft
      ? officialExprFromDraft(layout, inheritedDraft)
      : ''
  const initial = useMemo(() => {
    if (!layout) return null
    return own ? officialDraftFromExpr(layout, own) : inheritedDraft
  }, [layout, own, inheritedDraft])
  const [draft, setDraft] = useState<OfficialPriceDraft | null>(null)

  useEffect(() => {
    if (!layout) return
    setDraft(initial ?? officialDraftFromExpr(layout, ''))
  }, [initial, layout])

  const persist = async (value: string) => {
    try {
      await save.mutateAsync({ model_name: props.modelName, expression: value })
      toast.success(
        value ? t('Official price saved') : t('Official price removed')
      )
    } catch (error) {
      handleServerError(error)
    }
  }

  const expression = layout && draft ? officialExprFromDraft(layout, draft) : ''
  const blocked = !draft || officialDraftError(draft) !== null
  const unchanged = expression === own || (!own && expression === inherited)

  return (
    <section
      aria-label={t('Official Price')}
      className='space-y-3 rounded-lg border p-3'
    >
      <div className='space-y-1'>
        <h3 className='text-sm font-medium'>{t('Official Price')}</h3>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Shown to users above the group prices. It is never charged. Enter it the way the pricing page shows it; leave every price empty to hide the section.'
          )}
        </p>
        {category && !own && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Inherited from category {{name}}. Saving here gives this model its own official price.',
              { name: category.name }
            )}
          </p>
        )}
        {category && own && (
          <p className='text-muted-foreground text-xs'>
            {t(
              "This model's own official price takes precedence over category {{name}}.",
              { name: category.name }
            )}
          </p>
        )}
      </div>
      {entry && !layout && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Official prices are only shown for models priced per second or per token.'
          )}
        </p>
      )}
      {own && (!layout || !initial) && (
        <div className='space-y-1'>
          {layout && (
            <p role='status' className='text-xs text-amber-600'>
              {t(
                'The saved official price cannot be shown in this form. Saving replaces it.'
              )}
            </p>
          )}
          <code className='bg-muted block rounded px-2 py-1 font-mono text-xs break-all'>
            {own}
          </code>
        </div>
      )}
      {layout && draft && (
        <OfficialPriceFields
          layout={layout}
          draft={draft}
          onChange={setDraft}
          disabled={save.isPending}
          idPrefix={`official-price-${props.modelName}`}
        />
      )}
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!own || save.isPending}
          onClick={() => void persist('')}
        >
          {category ? t('Use category price') : t('Remove official price')}
        </Button>
        {layout && (
          <Button
            type='button'
            size='sm'
            disabled={
              !entry || save.isPending || blocked || !expression || unchanged
            }
            onClick={() => void persist(expression)}
          >
            {t('Save official price')}
          </Button>
        )}
      </div>
    </section>
  )
}
