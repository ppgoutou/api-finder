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
  SettingsForm,
  SettingsFormGrid,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const OPTION_PREFIX = 'task_error_alert_setting.'

const taskErrorAlertSchema = z.object({
  enabled: z.boolean(),
  merge_minutes: z.number().int().min(1),
  user_summary_enabled: z.boolean(),
  summary_minutes: z.number().int().min(1),
  hourly_stats_enabled: z.boolean(),
})

export type TaskErrorAlertFormValues = z.infer<typeof taskErrorAlertSchema>

type TaskErrorAlertSettingsSectionProps = {
  defaultValues: TaskErrorAlertFormValues
}

const FIELDS = [
  'enabled',
  'merge_minutes',
  'user_summary_enabled',
  'summary_minutes',
  'hourly_stats_enabled',
] as const

/**
 * Sends failed tasks and requests to the balance alert's Feishu bot:
 * upstream and our own errors as they happen, customer errors as a summary.
 */
export function TaskErrorAlertSettingsSection(
  props: TaskErrorAlertSettingsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<TaskErrorAlertFormValues>({
    resolver: zodResolver(taskErrorAlertSchema),
    defaultValues: props.defaultValues,
  })
  useResetForm(form, props.defaultValues)

  const onSubmit = async (values: TaskErrorAlertFormValues) => {
    for (const name of FIELDS) {
      if (values[name] !== props.defaultValues[name]) {
        await updateOption.mutateAsync({
          key: `${OPTION_PREFIX}${name}`,
          value: values[name],
        })
      }
    }
  }

  const switchField = (
    name: 'enabled' | 'user_summary_enabled' | 'hourly_stats_enabled',
    label: string,
    description: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <SettingsSwitchItem>
          <SettingsSwitchContent>
            <FormLabel>{t(label)}</FormLabel>
            <FormDescription>{t(description)}</FormDescription>
          </SettingsSwitchContent>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </SettingsSwitchItem>
      )}
    />
  )

  const numberField = (
    name: 'merge_minutes' | 'summary_minutes',
    label: string,
    description: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(label)}</FormLabel>
          <FormControl>
            <Input type='number' min={1} {...safeNumberFieldProps(field)} />
          </FormControl>
          <FormDescription>{t(description)}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SettingsSection title={t('Task error alerts')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Sends failed tasks and requests to the Feishu bot set up under upstream balance alerts. Upstream and system errors are sent as they happen; errors caused by the customer, such as low balance, invalid parameters or content review, are sent as a summary.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          {switchField(
            'enabled',
            'Enable task error alerts',
            'Checks for new failures every minute. Needs the Feishu bot webhook of upstream balance alerts.'
          )}
          {switchField(
            'user_summary_enabled',
            'Send a summary of customer errors',
            'Counts customer-caused errors by kind, user and model, and sends them together.'
          )}
          <SettingsFormGrid>
            {numberField(
              'merge_minutes',
              'Merge repeats for (minutes)',
              'After an upstream error is sent, repeats of it on the same channel are held for this long and sent as one message with their count. Urgent errors such as an empty upstream balance are never held.'
            )}
            {numberField(
              'summary_minutes',
              'Send the summary every (minutes)',
              'How often the customer error summary is sent. Nothing is sent when there were none.'
            )}
          </SettingsFormGrid>
          {switchField(
            'hourly_stats_enabled',
            'Send an hourly task report',
            'At the top of every hour, sends how many tasks the past hour had, the success rate, how many failed and the main reasons. Uses the Feishu bot of upstream balance alerts and works without the switch above.'
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
