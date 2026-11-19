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
import { useMutation } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

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
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'

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
import {
  checkBalanceAlerts,
  sendBalanceAlertTest,
  type BalanceAlertMonitor,
} from './balance-alert-api'

const FEISHU_WEBHOOK_PATTERN =
  /^https:\/\/open\.(feishu\.cn|larksuite\.com)\/open-apis\/bot\/\S+$/

const OPTION_PREFIX = 'balance_alert_setting.'

const NEW_MONITOR: BalanceAlertMonitor = {
  channel_id: 0,
  path: '/balance',
  field: 'balance',
  threshold: 100,
  divisor: 1,
  unit: 'CNY',
}

const createBalanceAlertSchema = (t: (key: string) => string) =>
  z.object({
    enabled: z.boolean(),
    feishu_webhook_url: z
      .string()
      .refine(
        (value) =>
          value.trim() === '' || FEISHU_WEBHOOK_PATTERN.test(value.trim()),
        t(
          'Use a Feishu bot webhook URL, like https://open.feishu.cn/open-apis/bot/v2/hook/...'
        )
      ),
    feishu_sign_secret: z.string(),
    interval_minutes: z.number().int().min(1),
    repeat_minutes: z.number().int().min(1),
    report_enabled: z.boolean(),
    monitors: z.array(
      z.object({
        channel_id: z.number().int().min(1, t('Enter a channel ID')),
        path: z.string().trim().min(1, t('Enter the balance path')),
        field: z.string().trim().min(1, t('Enter the balance field')),
        threshold: z.number().min(0),
        divisor: z.number().positive(t('Enter a number greater than 0')),
        unit: z.string(),
      })
    ),
  })

export type BalanceAlertFormValues = z.infer<
  ReturnType<typeof createBalanceAlertSchema>
>

type BalanceAlertSettingsSectionProps = {
  defaultValues: BalanceAlertFormValues
}

const SCALAR_FIELDS = [
  'enabled',
  'feishu_webhook_url',
  'interval_minutes',
  'repeat_minutes',
  'report_enabled',
] as const

/**
 * Sends a Feishu bot message when an upstream account balance falls below
 * its threshold. Each monitor reads the balance with the channel's own key.
 */
export function BalanceAlertSettingsSection(
  props: BalanceAlertSettingsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<BalanceAlertFormValues>({
    resolver: zodResolver(createBalanceAlertSchema(t)),
    defaultValues: props.defaultValues,
  })
  useResetForm(form, props.defaultValues)
  const monitors = useFieldArray({ control: form.control, name: 'monitors' })

  const check = useMutation({
    mutationFn: checkBalanceAlerts,
    onError: (error) => handleServerError(error),
  })
  const sendTest = useMutation({
    mutationFn: sendBalanceAlertTest,
    onSuccess: () => toast.success(t('Test message sent')),
    onError: (error) => handleServerError(error),
  })

  const onSubmit = async (values: BalanceAlertFormValues) => {
    const updates: Array<{ key: string; value: string | number | boolean }> = []
    for (const name of SCALAR_FIELDS) {
      const value = values[name]
      const normalized = typeof value === 'string' ? value.trim() : value
      if (normalized !== props.defaultValues[name]) {
        updates.push({ key: `${OPTION_PREFIX}${name}`, value: normalized })
      }
    }
    // The saved secret is never sent to the browser, so a blank field keeps it.
    const secret = values.feishu_sign_secret.trim()
    if (secret) {
      updates.push({ key: `${OPTION_PREFIX}feishu_sign_secret`, value: secret })
    }
    const nextMonitors = JSON.stringify(
      values.monitors.map((monitor) => ({
        ...monitor,
        path: monitor.path.trim(),
        field: monitor.field.trim(),
        unit: monitor.unit.trim(),
      }))
    )
    if (nextMonitors !== JSON.stringify(props.defaultValues.monitors)) {
      updates.push({ key: `${OPTION_PREFIX}monitors`, value: nextMonitors })
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
    form.setValue('feishu_sign_secret', '')
  }

  const numberField = (
    name: 'interval_minutes' | 'repeat_minutes',
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
    <SettingsSection title={t('Upstream balance alerts')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Checks the account balance of upstream channels and sends a Feishu bot message when it falls below the threshold, again while it stays low, and once when it recovers.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable balance alerts')}</FormLabel>
                  <FormDescription>
                    {t('Check the channels below on a schedule.')}
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
            name='report_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>
                    {t('Send a balance report on every check')}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      'Each check also sends every channel balance. A low balance sends only the low-balance reminder, at the repeat interval.'
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
          <SettingsFormGrid>
            <FormField
              control={form.control}
              name='feishu_webhook_url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Feishu bot webhook URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='https://open.feishu.cn/open-apis/bot/v2/hook/...'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'In a Feishu group, add a custom bot under Settings > Bots and copy its webhook URL.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='feishu_sign_secret'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Signature secret')}</FormLabel>
                  <FormControl>
                    <Input
                      type='password'
                      placeholder={t('Enter new secret to update')}
                      autoComplete='new-password'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Only if the bot has signature verification on. The saved secret is never shown; leave blank to keep it.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {numberField(
              'interval_minutes',
              'Check every (minutes)',
              'How often balances are read.'
            )}
            {numberField(
              'repeat_minutes',
              'Repeat reminder every (minutes)',
              'While a balance stays low, remind again after this long. Reminders go out on checks, so it cannot be shorter than the check interval.'
            )}
          </SettingsFormGrid>

          <Separator />
          <div className='space-y-1'>
            <h3 className='text-sm font-medium'>{t('Watched channels')}</h3>
            <p className='text-muted-foreground text-sm'>
              {t(
                'The balance is read with GET channel base URL + path, using the channel key. Field is the JSON path of the balance, such as balance or data.balance.'
              )}
            </p>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Divide by converts the upstream number into your unit, such as 10 when upstream reports 10 credits per yuan. The threshold and messages use the converted amount.'
              )}
            </p>
          </div>
          {monitors.fields.map((item, index) => (
            <div
              key={item.id}
              className='grid grid-cols-2 items-start gap-3 md:grid-cols-[7rem_1fr_1fr_6rem_8rem_6rem_auto]'
            >
              <FormField
                control={form.control}
                name={`monitors.${index}.channel_id`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Channel ID')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`monitors.${index}.path`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Balance path')}</FormLabel>
                    <FormControl>
                      <Input placeholder='/balance' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`monitors.${index}.field`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Balance field')}</FormLabel>
                    <FormControl>
                      <Input placeholder='balance' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`monitors.${index}.divisor`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Divide by')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step='any'
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`monitors.${index}.threshold`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Alert below')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step='any'
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`monitors.${index}.unit`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Unit')}</FormLabel>
                    <FormControl>
                      <Input placeholder='CNY' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='self-end'
                aria-label={t('Remove channel')}
                onClick={() => monitors.remove(index)}
              >
                <Trash2 aria-hidden='true' />
              </Button>
            </div>
          ))}
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => monitors.append({ ...NEW_MONITOR })}
            >
              <Plus aria-hidden='true' />
              {t('Add channel')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={check.isPending}
              onClick={() => check.mutate()}
            >
              {t('Check balances now')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={sendTest.isPending}
              onClick={() => sendTest.mutate()}
            >
              {t('Send test message')}
            </Button>
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Both buttons use the saved settings; save first. Checking does not send any message.'
            )}
          </p>
          {check.data && (
            <ul className='space-y-3' aria-label={t('Balance check results')}>
              {check.data.length === 0 && (
                <li className='text-muted-foreground text-sm'>
                  {t('No channels are watched yet.')}
                </li>
              )}
              {check.data.map((result) => (
                <li
                  key={result.channel_id}
                  className='space-y-1 rounded-lg border p-3 text-sm'
                >
                  <div className='font-medium'>
                    {result.channel_name || t('Channel')} #{result.channel_id}
                  </div>
                  {result.error ? (
                    <div className='text-destructive'>{result.error}</div>
                  ) : (
                    <div>
                      {t('Balance')}: {result.balance} {result.unit}
                      {' · '}
                      {t('Alert below')}: {result.threshold} {result.unit}
                    </div>
                  )}
                  {result.raw && (
                    <pre className='bg-muted text-muted-foreground overflow-x-auto rounded-md p-2 text-xs break-all whitespace-pre-wrap'>
                      {result.raw}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
