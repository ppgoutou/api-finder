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
import { Loader2, Send, Shield, UserRound, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  IconGithub,
  IconGoogle,
  IconLinuxDo,
  IconWeChat,
} from '@/assets/brand-icons'
import { useStatus } from '@/hooks/use-status'

import { AuthLayout } from '../auth-layout'
import { getOIDCDisplayName, isGoogleOIDC } from '../lib/oidc-provider'

type OAuthCallbackScreenProps = {
  provider: string
  mode: 'login' | 'bind' | 'verify'
}

type ProviderIcon =
  | LucideIcon
  | ((props: { className?: string }) => React.JSX.Element)

type ProviderMeta = {
  label: string
  Icon: ProviderIcon
}

// A normal callback finishes in a second or two; the "nothing happens" hint
// only appears once it is clearly taking longer than that.
export const SLOW_CALLBACK_HINT_DELAY_MS = 5000

const providerDictionary: Record<string, ProviderMeta> = {
  github: {
    label: 'GitHub',
    Icon: (props: { className?: string }) => (
      <IconGithub className={props.className} focusable='false' />
    ),
  },
  oidc: { label: 'OIDC', Icon: Shield },
  linuxdo: {
    label: 'LinuxDO',
    Icon: (props: { className?: string }) => (
      <IconLinuxDo className={props.className} focusable='false' />
    ),
  },
  telegram: { label: 'Telegram', Icon: Send },
  wechat: {
    label: 'WeChat',
    Icon: (props: { className?: string }) => (
      <IconWeChat className={props.className} focusable='false' />
    ),
  },
}

const GoogleIcon = (props: { className?: string }) => (
  <IconGoogle className={props.className} focusable='false' />
)

export function OAuthCallbackScreen(props: OAuthCallbackScreenProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [showSlowHint, setShowSlowHint] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(
      () => setShowSlowHint(true),
      SLOW_CALLBACK_HINT_DELAY_MS
    )
    return () => window.clearTimeout(timer)
  }, [])

  const normalized = props.provider?.toLowerCase() ?? ''
  let { label, Icon } = providerDictionary[normalized] || {
    label: 'account',
    Icon: UserRound,
  }
  // OIDC is a protocol name; show the provider the admin configured instead.
  if (normalized === 'oidc') {
    label = getOIDCDisplayName(status)
    if (isGoogleOIDC(status)) Icon = GoogleIcon
  }

  const providerLabel = t(label)
  let headline = t('Signing you in with {{provider}}', {
    provider: providerLabel,
  })
  let description: string | null = null
  let slowHint = t(
    "You'll be redirected automatically. You can return to the previous page if nothing happens after a few seconds."
  )
  if (props.mode === 'bind') {
    headline = t('Binding your {{provider}} account', {
      provider: providerLabel,
    })
    description = t(
      'Hang tight while we securely link this account to your profile.'
    )
  }
  if (props.mode === 'verify') {
    headline = t('Verifying your {{provider}} account', {
      provider: providerLabel,
    })
    description = t('Confirming the account linked to your profile.')
  }
  if (props.mode !== 'login') {
    slowHint = t('Return to the original window to continue.')
  }

  return (
    <AuthLayout>
      <div
        role='status'
        className='flex w-full flex-col items-center space-y-4 text-center'
      >
        <div className='bg-muted flex h-16 w-16 items-center justify-center rounded-2xl'>
          <Icon className='h-8 w-8' />
        </div>
        <h2 className='text-2xl font-semibold tracking-tight'>{headline}</h2>
        {description && (
          <p className='text-muted-foreground text-sm sm:text-base'>
            {description}
          </p>
        )}
        <Loader2
          aria-hidden='true'
          className='text-muted-foreground h-5 w-5 animate-spin'
        />
        {showSlowHint && (
          <p className='text-muted-foreground text-sm'>{slowHint}</p>
        )}
      </div>
    </AuthLayout>
  )
}
