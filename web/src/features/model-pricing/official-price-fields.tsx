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

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  officialDraftError,
  type OfficialPriceDraft,
  type OfficialPriceLayout,
  type TokenOfficialDraft,
  type VideoOfficialDraft,
  type VideoOfficialDraftRow,
  type VideoOfficialLayout,
} from '@/features/pricing/lib/official-price'
import { taskEnumLabel } from '@/features/pricing/lib/task-price-display'
import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  getSitePricingCurrency,
  isValidPricingCurrency,
  USD_PRICING_CURRENCY,
  type PricingCurrency,
} from './currency'
import { PricingAmountInput } from './pricing-amount-input'

/** The currency administrators enter prices in, as in the pricing editor. */
function useOfficialPriceCurrency(): PricingCurrency {
  const currencyConfig = useSystemConfigStore((state) => state.config.currency)
  const preference = usePricingPreferencesStore((state) => state.currency)
  const site = getSitePricingCurrency(currencyConfig)
  return preference === 'site' && isValidPricingCurrency(site)
    ? site
    : USD_PRICING_CURRENCY
}

type FieldsProps<TDraft extends OfficialPriceDraft> = {
  draft: TDraft
  onChange: (draft: TDraft) => void
  currency: PricingCurrency
  disabled?: boolean
  idPrefix: string
}

function TokenFields(
  props: FieldsProps<TokenOfficialDraft> & { cache: boolean }
) {
  const { t } = useTranslation()
  const fields: {
    key: keyof Omit<TokenOfficialDraft, 'kind'>
    label: string
  }[] = [
    { key: 'input', label: t('Input') },
    { key: 'output', label: t('Output') },
  ]
  if (props.cache || props.draft.cacheRead || props.draft.cacheWrite) {
    fields.push(
      { key: 'cacheRead', label: t('Cache Read') },
      { key: 'cacheWrite', label: t('Cache Write') }
    )
  }
  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      {fields.map((field) => {
        const id = `${props.idPrefix}-${field.key}`
        return (
          <div key={field.key} className='space-y-1'>
            <Label htmlFor={id} className='text-xs'>
              {t('{{label}} ({{currency}} / 1M tokens)', {
                label: field.label,
                currency: props.currency.label,
                // React escapes the text; keep "/" literal under any i18n setup.
                interpolation: { escapeValue: false },
              })}
            </Label>
            <PricingAmountInput
              id={id}
              value={props.draft[field.key]}
              currency={props.currency}
              disabled={props.disabled}
              placeholder='0'
              onChange={(usd) =>
                props.onChange({ ...props.draft, [field.key]: usd })
              }
            />
          </div>
        )
      })}
    </div>
  )
}

type VideoColumn = {
  key: keyof VideoOfficialDraftRow
  label: string
}

function VideoFields(
  props: FieldsProps<VideoOfficialDraft> & { layout: VideoOfficialLayout }
) {
  const { t, i18n } = useTranslation()
  const unit = (label: string, suffix: string) =>
    t('{{label}} ({{currency}} {{suffix}})', {
      label,
      currency: props.currency.label,
      suffix,
      // React escapes the text; keep "/" literal under any i18n setup.
      interpolation: { escapeValue: false },
    })
  const columns: VideoColumn[] = [
    { key: 'second', label: unit(t('Price per second'), t('/second')) },
  ]
  if (props.layout.referenceSwitchValue) {
    columns.push({
      key: 'referenceSecond',
      label: unit(t('Reference video order price'), t('/second')),
    })
  }
  if (props.layout.fields.referenceField) {
    columns.push({
      key: 'referenceMillion',
      label: unit(t('Reference video order price'), '/ 1M tokens'),
    })
  }
  if (props.layout.inputVideoSeconds) {
    columns.push({
      key: 'inputVideoSecond',
      label: unit(t('Reference video price per second'), t('/second')),
    })
  }
  if (props.layout.inputImages) {
    columns.push(
      { key: 'inputImage', label: unit(t('Input image price'), t('/image')) },
      { key: 'freeImages', label: t('Free input images') }
    )
  }
  const optionDefinition = props.layout.schema[props.layout.fields.optionField]
  const update = (
    option: string,
    key: keyof VideoOfficialDraftRow,
    value: string
  ) =>
    props.onChange({
      ...props.draft,
      rows: {
        ...props.draft.rows,
        [option]: { ...props.draft.rows[option], [key]: value },
      },
    })

  return (
    <div className='overflow-x-auto rounded-md border'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-muted-foreground text-xs'>
          <tr>
            <th scope='col' className='px-2 py-2 text-left font-medium'>
              {t('Resolution')}
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope='col'
                className='min-w-28 px-2 py-2 text-left font-medium'
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y'>
          {props.layout.options.map((option) => {
            const row = props.draft.rows[option]
            const optionLabel = taskEnumLabel(
              optionDefinition,
              option,
              i18n.language
            )
            return (
              <tr key={option}>
                <th
                  scope='row'
                  className='px-2 py-1.5 text-left font-mono font-normal whitespace-nowrap'
                >
                  {optionLabel}
                </th>
                {columns.map((column) => {
                  const label = `${optionLabel} ${column.label}`
                  return (
                    <td key={column.key} className='px-2 py-1.5'>
                      {column.key === 'freeImages' ? (
                        <Input
                          aria-label={label}
                          type='number'
                          min={0}
                          step={1}
                          inputMode='numeric'
                          value={row?.freeImages ?? ''}
                          disabled={props.disabled}
                          placeholder='0'
                          onChange={(event) =>
                            update(option, 'freeImages', event.target.value)
                          }
                        />
                      ) : (
                        <PricingAmountInput
                          aria-label={label}
                          value={row?.[column.key] ?? ''}
                          currency={props.currency}
                          disabled={props.disabled}
                          placeholder='0'
                          onChange={(usd) => update(option, column.key, usd)}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Official price inputs in the layout the pricing page shows the price in:
 * per second by resolution for video models, per 1M tokens for token models.
 * The draft holds USD; the inputs show the administrator's currency.
 */
export function OfficialPriceFields(props: {
  layout: OfficialPriceLayout
  draft: OfficialPriceDraft
  onChange: (draft: OfficialPriceDraft) => void
  disabled?: boolean
  idPrefix: string
}) {
  const { t } = useTranslation()
  const currency = useOfficialPriceCurrency()
  const error = officialDraftError(props.draft)

  return (
    <div className='space-y-2'>
      {props.layout.kind === 'token' && props.draft.kind === 'token' && (
        <TokenFields
          draft={props.draft}
          onChange={props.onChange}
          currency={currency}
          disabled={props.disabled}
          idPrefix={props.idPrefix}
          cache={props.layout.cache}
        />
      )}
      {props.layout.kind === 'video' && props.draft.kind === 'video' && (
        <VideoFields
          layout={props.layout}
          draft={props.draft}
          onChange={props.onChange}
          currency={currency}
          disabled={props.disabled}
          idPrefix={props.idPrefix}
        />
      )}
      {error && (
        <p role='alert' className='text-destructive text-xs'>
          {error === 'missing-second'
            ? t('Enter the price per second for every resolution.')
            : t(
                'Enter the reference video price for every resolution, or for none.'
              )}
        </p>
      )}
    </div>
  )
}
