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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type FieldErrors,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { PromoDialog } from '@/features/home/components/promo-popup/promo-dialog'
import { PROMO_POPUP_QUERY_KEY } from '@/features/home/hooks/use-promo-popup'
import {
  emptyPromoCard,
  parsePromoPopup,
  PROMO_POPUP_DEFAULT_DAILY_LIMIT,
  PROMO_POPUP_MAX_CARDS,
  PROMO_POPUP_MAX_DAILY_LIMIT,
  PROMO_POPUP_OPTION_KEY,
  type PromoCard,
  selectPromoCards,
  serializePromoPopup,
  toPromoDay,
} from '@/features/home/lib/promo-popup'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../../components/settings-form-layout'
import { SettingsPageFormActions } from '../../components/settings-page-context'
import { SettingsSection } from '../../components/settings-section'
import { useUpdateOption } from '../../hooks/use-update-option'
import { CollapsibleMediaClip } from '../components/collapsible-media-clip'
import { PromoCardFields } from './card-fields'
import { promoPopupFormSchema, type PromoPopupFormValues } from './schema'

type PromoPopupSectionProps = {
  /** The stored `PromoPopup` option. */
  defaultValue: string
}

export function PromoPopupSection(props: PromoPopupSectionProps) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const initial = useMemo(
    () => parsePromoPopup(props.defaultValue),
    [props.defaultValue]
  )
  const form = useForm<PromoPopupFormValues>({
    resolver: zodResolver(promoPopupFormSchema),
    defaultValues: initial,
  })
  const cards = useFieldArray({ control: form.control, name: 'cards' })
  const watched = useWatch({ control: form.control })
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [previewing, setPreviewing] = useState(false)
  const openFirstCard = useRef(false)

  useEffect(() => {
    form.reset(initial)
    setOpen({})
    openFirstCard.current = false
  }, [initial, form])

  useEffect(() => {
    if (!openFirstCard.current) return
    const first = cards.fields[0]
    if (!first) return
    openFirstCard.current = false
    setOpen((current) => ({ ...current, [first.id]: true }))
  }, [cards.fields])

  const onSubmit = async (values: PromoPopupFormValues) => {
    const value = serializePromoPopup(values)
    if (value === serializePromoPopup(initial)) return
    const result = await updateOption.mutateAsync({
      key: PROMO_POPUP_OPTION_KEY,
      value,
    })
    if (!result.success) return
    await queryClient.invalidateQueries({ queryKey: PROMO_POPUP_QUERY_KEY })
  }

  // A collapsed card would otherwise hide the field that blocks saving.
  const openInvalidCards = (errors: FieldErrors<PromoPopupFormValues>) => {
    setOpen((current) => {
      const next = { ...current }
      cards.fields.forEach((field, index) => {
        if (errors.cards?.[index]) next[field.id] = true
      })
      return next
    })
  }

  const save = form.handleSubmit(onSubmit, openInvalidCards)
  const previewCards = selectPromoCards(
    {
      enabled: true,
      dailyLimit: PROMO_POPUP_DEFAULT_DAILY_LIMIT,
      cards: (watched.cards ?? []) as PromoCard[],
    },
    i18n.resolvedLanguage || i18n.language,
    toPromoDay(new Date())
  )

  return (
    <SettingsSection title={t('Promotion popup')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Shown when visitors open the home page. Prices here are display text and do not change what requests are billed. A card stops showing after its last day.'
        )}{' '}
        {t(
          'Chinese fields are shown to simplified and traditional Chinese interfaces; leave them empty to show the default text.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={save}>
          <SettingsPageFormActions
            onSave={save}
            isSaving={updateOption.isPending}
          />

          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Show the popup')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Turn this off to hide the popup without removing its cards.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='dailyLimit'
            render={({ field }) => (
              <FormItem className='max-w-xs'>
                <FormLabel>{t('Daily displays per browser')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1}
                    max={PROMO_POPUP_MAX_DAILY_LIMIT}
                    step={1}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) ? '' : field.value}
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'How many times one browser can see the popup each day. Visitors can still turn it off for the day.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <fieldset className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'>
            <legend className='px-1 text-sm font-semibold'>
              {t('Popup cards')}
            </legend>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={cards.fields.length >= PROMO_POPUP_MAX_CARDS}
                onClick={() => {
                  openFirstCard.current = true
                  cards.prepend(emptyPromoCard())
                }}
              >
                <Plus data-icon='inline-start' />
                {t('Add card')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={previewCards.length === 0}
                onClick={() => setPreviewing(true)}
              >
                <Eye data-icon='inline-start' />
                {t('Preview')}
              </Button>
            </div>
            {cards.fields.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {t('No cards yet. The popup stays hidden until you add one.')}
              </p>
            )}
            {cards.fields.map((card, index) => {
              const item = watched.cards?.[index]
              const label = t('Card {{number}}', { number: index + 1 })
              return (
                <CollapsibleMediaClip
                  key={card.id}
                  open={Boolean(open[card.id])}
                  onOpenChange={(next) =>
                    setOpen((current) => ({ ...current, [card.id]: next }))
                  }
                  label={label}
                  title={item?.title || item?.modelName || label}
                  subtitle={item?.endsAt}
                  toolbar={
                    <>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        disabled={index === 0}
                        aria-label={t('Move card {{number}} up', {
                          number: index + 1,
                        })}
                        onClick={() => cards.move(index, index - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        disabled={index === cards.fields.length - 1}
                        aria-label={t('Move card {{number}} down', {
                          number: index + 1,
                        })}
                        onClick={() => cards.move(index, index + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={t('Remove card {{number}}', {
                          number: index + 1,
                        })}
                        onClick={() => cards.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  }
                >
                  <PromoCardFields control={form.control} index={index} />
                </CollapsibleMediaClip>
              )
            })}
          </fieldset>
        </SettingsForm>
      </Form>
      {previewing && (
        <PromoDialog
          open
          cards={previewCards}
          onClose={() => setPreviewing(false)}
        />
      )}
    </SettingsSection>
  )
}
