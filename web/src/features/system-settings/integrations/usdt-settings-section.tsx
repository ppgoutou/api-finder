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

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { UsdtExceptionReceipts } from './usdt-exception-receipts'

export interface UsdtSettingsValues {
  USDTEnabled: boolean
  USDTGatewayAddress: string
  USDTClientId: string
  USDTApiSecret: string
  USDTWebhookSecret: string
  USDTEnvironment: string
  USDTContractAddress: string
  USDTMinTopUp: number
}

const USDT_ENVIRONMENT_LABELS: Record<string, string> = {
  nile: 'Nile testnet',
  mainnet: 'Mainnet (real funds)',
}

interface UsdtSettingsSectionProps {
  values: UsdtSettingsValues
  onValueChange: <K extends keyof UsdtSettingsValues>(
    key: K,
    value: UsdtSettingsValues[K]
  ) => void
}

/**
 * Settings for the TRC-20 USDT gateway. Nile and mainnet are separate gateway
 * deployments, so each has its own address, credentials, and contract.
 */
export function UsdtSettingsSection(props: UsdtSettingsSectionProps) {
  const { t } = useTranslation()
  const values = props.values

  return (
    <div className='space-y-6'>
      <div className='space-y-4'>
        <div>
          <h3 className='text-lg font-medium'>{t('USDT Gateway')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Takes TRC-20 USDT top-ups. One USDT counts as one USD, and yuan amounts convert at the USD exchange rate in the currency settings.'
            )}
          </p>
        </div>

        <Alert>
          <AlertDescription className='text-xs'>
            <div>
              {t('Register this webhook address with the gateway:')}{' '}
              <code>{'<ServerAddress>/api/usdt/webhook'}</code>
            </div>
            <div>
              {t(
                'Register your site origin too, so the checkout page can link back to the wallet.'
              )}
            </div>
          </AlertDescription>
        </Alert>

        <SettingsSwitchField
          checked={values.USDTEnabled}
          onCheckedChange={(checked) =>
            props.onValueChange('USDTEnabled', checked)
          }
          label={t('Enable USDT top-up')}
          description={t(
            'Stays off for users until every field below is filled.'
          )}
          className='py-0'
        />

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-environment'>{t('Environment')}</Label>
            <Select
              value={values.USDTEnvironment}
              onValueChange={(value) =>
                props.onValueChange('USDTEnvironment', value ?? '')
              }
            >
              <SelectTrigger id='usdt-environment' className='w-full'>
                <SelectValue placeholder={t('Select environment')}>
                  {(value: string) =>
                    USDT_ENVIRONMENT_LABELS[value]
                      ? t(USDT_ENVIRONMENT_LABELS[value])
                      : t('Select environment')
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(USDT_ENVIRONMENT_LABELS).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {t(label)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Answers from any other environment are refused and never credited.'
              )}
            </p>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-gateway-address'>{t('Gateway address')}</Label>
            <Input
              id='usdt-gateway-address'
              placeholder='https://gateway.example.com'
              value={values.USDTGatewayAddress}
              onChange={(event) =>
                props.onValueChange('USDTGatewayAddress', event.target.value)
              }
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-client-id'>{t('Client ID')}</Label>
            <Input
              id='usdt-client-id'
              placeholder='cli_...'
              autoComplete='off'
              value={values.USDTClientId}
              onChange={(event) =>
                props.onValueChange('USDTClientId', event.target.value)
              }
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-contract-address'>
              {t('USDT contract address')}
            </Label>
            <Input
              id='usdt-contract-address'
              placeholder='T...'
              value={values.USDTContractAddress}
              onChange={(event) =>
                props.onValueChange('USDTContractAddress', event.target.value)
              }
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-api-secret'>{t('API Secret')}</Label>
            <Input
              id='usdt-api-secret'
              type='password'
              autoComplete='new-password'
              placeholder={t('Enter new key to update')}
              value={values.USDTApiSecret}
              onChange={(event) =>
                props.onValueChange('USDTApiSecret', event.target.value)
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t('Leave blank unless rotating the secret')}
            </p>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-webhook-secret'>{t('Webhook Secret')}</Label>
            <Input
              id='usdt-webhook-secret'
              type='password'
              autoComplete='new-password'
              placeholder={t('Enter new key to update')}
              value={values.USDTWebhookSecret}
              onChange={(event) =>
                props.onValueChange('USDTWebhookSecret', event.target.value)
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t('Leave blank unless rotating the secret')}
            </p>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='usdt-min-topup'>{t('Minimum top-up (USD)')}</Label>
            <Input
              id='usdt-min-topup'
              type='number'
              min={1}
              value={values.USDTMinTopUp}
              onChange={(event) =>
                props.onValueChange('USDTMinTopUp', Number(event.target.value))
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Users see this converted at the USD exchange rate and rounded up.'
              )}
            </p>
          </div>
        </div>
      </div>

      <UsdtExceptionReceipts />
    </div>
  )
}
