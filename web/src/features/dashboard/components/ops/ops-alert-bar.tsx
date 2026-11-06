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
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

const DISMISSED_STORAGE_KEY = 'ops-dashboard-dismissed-alerts'

export interface OpsAlertItem {
  key: string
  n: number
  label: string
  href: string
}

function readDismissedAlerts() {
  try {
    return localStorage.getItem(DISMISSED_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Closing hides the bar for these exact figures, so any later change to what
 * needs handling brings it back rather than staying silent.
 */
export function OpsAlertBar(props: { alerts: OpsAlertItem[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [dismissed, setDismissed] = useState(readDismissedAlerts)
  const signature = props.alerts
    .map((alert) => `${alert.key}:${alert.n}`)
    .join(',')

  if (props.alerts.length === 0 || dismissed === signature) return null

  const dismiss = () => {
    setDismissed(signature)
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, signature)
    } catch {
      // Without storage the bar stays closed until the page is reloaded.
    }
  }

  return (
    <Alert className='border-warning/40 bg-warning/10 pr-11'>
      <AlertTriangle className='text-warning' aria-hidden='true' />
      <AlertDescription className='flex flex-wrap gap-x-5 gap-y-1'>
        {props.alerts.map((alert) => (
          <a
            key={alert.key}
            href={alert.href}
            className='text-foreground hover:underline'
          >
            <span className='text-warning font-mono font-bold'>
              {formatNumber(alert.n, locale)}
            </span>{' '}
            {alert.label}
          </a>
        ))}
      </AlertDescription>
      <AlertAction className='top-1/2 -translate-y-1/2'>
        <Button
          variant='ghost'
          size='icon'
          className='size-7'
          onClick={dismiss}
          aria-label={t('Close')}
        >
          <X aria-hidden='true' />
        </Button>
      </AlertAction>
    </Alert>
  )
}
