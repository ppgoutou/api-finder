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
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({
  enabled: z.boolean(),
  baseGroup: z.string().trim().min(1),
  vipGroup: z.string().trim().min(1),
  totalTopUpUsd: z.coerce.number().min(0),
  singleTopUpUsd: z.coerce.number().min(0),
  downgradeOnReversal: z.boolean(),
  vipSupportTelegram: z.string().trim(),
})

type Values = z.infer<typeof schema>

/** Option key under membership_setting for each form field. */
const OPTION_KEYS: Record<keyof Values, string> = {
  enabled: 'membership_setting.enabled',
  baseGroup: 'membership_setting.base_group',
  vipGroup: 'membership_setting.vip_group',
  totalTopUpUsd: 'membership_setting.total_topup_usd',
  singleTopUpUsd: 'membership_setting.single_topup_usd',
  downgradeOnReversal: 'membership_setting.downgrade_on_reversal',
  vipSupportTelegram: 'membership_setting.vip_support_telegram',
}

export function MembershipSettingsSection(props: { defaultValues: Values }) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: props.defaultValues,
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  const busy = updateOption.isPending || isSubmitting

  async function onSubmit(values: Values) {
    const changed = (Object.keys(OPTION_KEYS) as Array<keyof Values>).filter(
      (field) => values[field] !== props.defaultValues[field]
    )
    if (changed.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const field of changed) {
      await updateOption.mutateAsync({
        key: OPTION_KEYS[field],
        value: String(values[field]),
      })
    }
    form.reset(values)
  }

  const renderSwitch = (
    name: 'enabled' | 'downgradeOnReversal',
    label: string,
    description: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <SettingsSwitchItem>
          <SettingsSwitchContent>
            <FormLabel>{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </SettingsSwitchContent>
          <FormControl>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={busy}
            />
          </FormControl>
        </SettingsSwitchItem>
      )}
    />
  )

  const renderInput = (
    name:
      | 'baseGroup'
      | 'vipGroup'
      | 'totalTopUpUsd'
      | 'singleTopUpUsd'
      | 'vipSupportTelegram',
    label: string,
    description: string,
    numeric?: boolean
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={numeric ? 'number' : 'text'}
              min={numeric ? 0 : undefined}
              step={numeric ? 'any' : undefined}
              {...field}
            />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SettingsSection title={t('VIP Membership')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={busy}
            isSaveDisabled={!isDirty}
            saveLabel='Save VIP membership settings'
          />
          {renderSwitch(
            'enabled',
            t('Upgrade users to VIP automatically'),
            t(
              'Users in the base group move to the VIP group once their paid top-ups and redemption codes reach a threshold. VIP prices come from the VIP group ratio.'
            )
          )}

          {enabled && (
            <>
              <div className='grid gap-6 sm:grid-cols-2'>
                {renderInput(
                  'totalTopUpUsd',
                  t('Total top-up threshold (USD)'),
                  t(
                    'Paid top-ups in total that make a user VIP; 0 turns this rule off'
                  ),
                  true
                )}
                {renderInput(
                  'singleTopUpUsd',
                  t('Single top-up threshold (USD)'),
                  t(
                    'One top-up or code of this size makes a user VIP; 0 turns this rule off'
                  ),
                  true
                )}
                {renderInput(
                  'baseGroup',
                  t('Standard group'),
                  t('Only users in this group are upgraded')
                )}
                {renderInput(
                  'vipGroup',
                  t('VIP group'),
                  t('Must exist in the group ratios')
                )}
                {renderInput(
                  'vipSupportTelegram',
                  t('VIP support Telegram'),
                  t(
                    'Handle without @ shown to VIP users; empty uses the regular support account'
                  )
                )}
              </div>
              {renderSwitch(
                'downgradeOnReversal',
                t('Downgrade after a refund'),
                t(
                  'When a refunded or disputed payment was what qualified a user, move them back to the standard group'
                )
              )}
            </>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
