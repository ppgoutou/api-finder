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
import { Separator } from '@/components/ui/separator'
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

const createMediaStorageSchema = (t: (key: string) => string) => {
  const url = z
    .string()
    .refine(
      (value) => value.trim() === '' || /^https?:\/\/\S+$/.test(value.trim()),
      t('Provide a valid URL starting with http:// or https://')
    )
  return z.object({
    enabled: z.boolean(),
    overseas_endpoint: url,
    overseas_region: z.string(),
    overseas_bucket: z.string(),
    overseas_access_key_id: z.string(),
    overseas_access_secret: z.string(),
    overseas_virtual_host: z.boolean(),
    overseas_public_url: url,
    mainland_enabled: z.boolean(),
    mainland_endpoint: url,
    mainland_region: z.string(),
    mainland_bucket: z.string(),
    mainland_access_key_id: z.string(),
    mainland_access_secret: z.string(),
    mainland_virtual_host: z.boolean(),
    mainland_public_url: url,
    mainland_countries: z.string(),
    object_prefix: z.string(),
    retention_days: z.number().int().min(0),
  })
}

export type MediaStorageFormValues = z.infer<
  ReturnType<typeof createMediaStorageSchema>
>

type FieldName = keyof MediaStorageFormValues

type TextField = {
  name: FieldName
  label: string
  placeholder?: string
  description?: string
  secret?: boolean
}

const targetFields = (prefix: 'overseas' | 'mainland'): TextField[] => [
  {
    name: `${prefix}_endpoint`,
    label: 'S3 endpoint',
    placeholder:
      prefix === 'overseas'
        ? 'https://<account>.r2.cloudflarestorage.com'
        : 'https://cos.ap-hongkong.myqcloud.com',
  },
  {
    name: `${prefix}_region`,
    label: 'Region',
    placeholder: prefix === 'overseas' ? 'auto' : 'ap-hongkong',
  },
  { name: `${prefix}_bucket`, label: 'Bucket' },
  { name: `${prefix}_access_key_id`, label: 'Access key ID' },
  {
    name: `${prefix}_access_secret`,
    label: 'Secret access key',
    description: 'The saved key is never shown; leave blank to keep it.',
    secret: true,
  },
  {
    name: `${prefix}_public_url`,
    label: 'Public URL',
    placeholder:
      prefix === 'overseas'
        ? 'https://media.example.com'
        : 'https://cn-media.example.com',
    description: 'CDN or custom domain that serves this bucket.',
  },
]

const SECRET_FIELDS: FieldName[] = [
  'overseas_access_secret',
  'mainland_access_secret',
]

type MediaStorageSettingsSectionProps = {
  defaultValues: MediaStorageFormValues
}

/**
 * Object storage for generated videos. Finished videos are copied to the
 * overseas bucket and, when enabled, the mainland bucket; viewers are sent to
 * the copy for their country.
 */
export function MediaStorageSettingsSection(
  props: MediaStorageSettingsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<MediaStorageFormValues>({
    resolver: zodResolver(createMediaStorageSchema(t)),
    defaultValues: props.defaultValues,
  })

  useResetForm(form, props.defaultValues)

  const onSubmit = async (values: MediaStorageFormValues) => {
    const updates: Array<{ key: string; value: string | number | boolean }> =
      []
    for (const name of Object.keys(values) as FieldName[]) {
      const value = values[name]
      const normalized = typeof value === 'string' ? value.trim() : value
      // Saved secrets are never sent to the browser, so a blank field keeps them.
      if (SECRET_FIELDS.includes(name)) {
        if (normalized !== '') {
          updates.push({ key: `media_storage.${name}`, value: normalized })
        }
        continue
      }
      const initial = props.defaultValues[name]
      if (normalized !== (typeof initial === 'string' ? initial.trim() : initial)) {
        updates.push({ key: `media_storage.${name}`, value: normalized })
      }
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
    for (const name of SECRET_FIELDS) {
      form.setValue(name, '')
    }
  }

  const renderSwitch = (name: FieldName, label: string, description: string) => (
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
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </SettingsSwitchItem>
      )}
    />
  )

  const renderText = (item: TextField) => (
    <FormField
      key={item.name}
      control={form.control}
      name={item.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t(item.label)}</FormLabel>
          <FormControl>
            <Input
              type={item.secret ? 'password' : 'text'}
              placeholder={
                item.secret ? t('Enter new key to update') : item.placeholder
              }
              autoComplete={item.secret ? 'new-password' : 'off'}
              value={String(field.value ?? '')}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          </FormControl>
          {item.description && (
            <FormDescription>{t(item.description)}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SettingsSection title={t('Media storage')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Copies finished videos into your own S3-compatible storage, such as Cloudflare R2 or Tencent COS, so they stay available after upstream links expire and load from a CDN near each viewer.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          {renderSwitch(
            'enabled',
            'Store generated videos',
            'Copy each finished video to the buckets below.'
          )}
          <h3 className='text-sm font-medium'>{t('Overseas storage')}</h3>
          <SettingsFormGrid>
            {targetFields('overseas').map(renderText)}
          </SettingsFormGrid>
          {renderSwitch(
            'overseas_virtual_host',
            'Virtual-hosted addressing',
            'Address objects as bucket.endpoint instead of endpoint/bucket. Required by Tencent COS.'
          )}
          <Separator />
          {renderSwitch(
            'mainland_enabled',
            'Mainland China storage',
            'Also copy videos to a second bucket for viewers in the countries listed below.'
          )}
          <SettingsFormGrid>
            {targetFields('mainland').map(renderText)}
            {renderText({
              name: 'mainland_countries',
              label: 'Mainland viewer countries',
              placeholder: 'CN',
              description:
                'Comma-separated country codes from Cloudflare that get the mainland copy.',
            })}
          </SettingsFormGrid>
          {renderSwitch(
            'mainland_virtual_host',
            'Virtual-hosted addressing',
            'Address objects as bucket.endpoint instead of endpoint/bucket. Required by Tencent COS.'
          )}
          <Separator />
          <SettingsFormGrid>
            {renderText({
              name: 'object_prefix',
              label: 'Object prefix',
              placeholder: 'videos',
            })}
            <FormField
              control={form.control}
              name='retention_days'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Retention days')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Stop serving copies older than this. Set the same age in the bucket lifecycle rule. 0 keeps them forever.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsFormGrid>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
