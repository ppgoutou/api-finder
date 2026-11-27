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
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

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
import {
  HOLIDAY_THEME_OPTION_KEY,
  parseHolidayTheme,
  serializeHolidayTheme,
} from '@/lib/holiday-theme'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../../components/settings-form-layout'
import { SettingsPageFormActions } from '../../components/settings-page-context'
import { SettingsSection } from '../../components/settings-section'
import { useUpdateOption } from '../../hooks/use-update-option'

const holidayThemeFormSchema = z
  .object({
    christmas: z.boolean(),
    start: z.string(),
    end: z.string(),
  })
  .superRefine((values, context) => {
    if (!values.christmas) return
    if (values.start === '') {
      context.addIssue({
        code: 'custom',
        path: ['start'],
        message: 'Pick the first day',
      })
    }
    if (values.end === '') {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Pick the last day',
      })
    }
    if (values.start !== '' && values.end !== '' && values.end < values.start) {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'The last day must not be before the first day',
      })
    }
  })

type HolidayThemeFormValues = z.infer<typeof holidayThemeFormSchema>

type HolidayThemeSectionProps = {
  /** The stored `HolidayTheme` option. */
  defaultValue: string
}

export function HolidayThemeSection(props: HolidayThemeSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const initial = useMemo<HolidayThemeFormValues>(() => {
    const settings = parseHolidayTheme(props.defaultValue)
    return {
      christmas: settings.theme === 'christmas',
      start: settings.start,
      end: settings.end,
    }
  }, [props.defaultValue])
  const form = useForm<HolidayThemeFormValues>({
    resolver: zodResolver(holidayThemeFormSchema),
    defaultValues: initial,
  })

  useEffect(() => {
    form.reset(initial)
  }, [initial, form])

  const onSubmit = async (values: HolidayThemeFormValues) => {
    const value = serializeHolidayTheme({
      theme: values.christmas ? 'christmas' : '',
      start: values.start,
      end: values.end,
    })
    if (value === (props.defaultValue ?? '')) return
    await updateOption.mutateAsync({ key: HOLIDAY_THEME_OPTION_KEY, value })
  }

  const save = form.handleSubmit(onSubmit)

  return (
    <SettingsSection title={t('Holiday theme')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Adds snow, warm lights and a Santa hat on the logo to the home page and the header, from the first day to the last day by each visitor’s own date. It turns itself off after the last day.'
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
            name='christmas'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Christmas theme')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Visitors who ask their system for less motion see no snow.'
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

          <div className='grid max-w-lg gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='start'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('First day')}</FormLabel>
                  <FormControl>
                    <Input type='date' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='end'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Last day')}</FormLabel>
                  <FormControl>
                    <Input type='date' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
