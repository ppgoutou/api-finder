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
import { CrownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

import { VIP_LIME_TEXT } from '../lib/vip-style'
import type { MembershipInfo } from '../types'

interface VipActionsProps {
  info?: MembershipInfo
  /** Where the buttons sit, for analytics. */
  source: string
  /** Also link to the VIP page, for surfaces that are not that page. */
  showLearnMore?: boolean
  /** Called before navigating, such as to close a dialog. */
  onNavigate?: () => void
  /** Lime buttons for the dark VIP page and dialog. */
  night?: boolean
  className?: string
}

/**
 * The next step toward VIP: visitors sign up, standard members top up, and
 * VIP members are told they already have it.
 */
export function VipActions(props: VipActionsProps) {
  const { t } = useTranslation()
  const info = props.info
  const primaryVariant = props.night ? 'night' : 'vip'
  const buttonSize = props.night ? 'xl' : 'lg'
  const follow = (target: string) => {
    trackEvent('vip_cta_click', { source: props.source, target })
    props.onNavigate?.()
  }

  let primary = (
    <Button
      variant={primaryVariant}
      size={buttonSize}
      render={<Link to='/sign-up' onClick={() => follow('sign-up')} />}
    >
      <HugeiconsIcon icon={CrownIcon} className='size-4' aria-hidden />
      {t('Sign up and start saving')}
    </Button>
  )
  if (info?.signed_in) {
    primary = (
      <Button
        variant={primaryVariant}
        size={buttonSize}
        render={<Link to='/wallet' onClick={() => follow('wallet')} />}
      >
        <HugeiconsIcon icon={CrownIcon} className='size-4' aria-hidden />
        {t('Top up to become VIP')}
      </Button>
    )
  }
  if (info?.is_vip) {
    primary = (
      <span
        className={
          props.night
            ? cn(
                'rounded-control border-accent-night/30 bg-accent-night/10 inline-flex h-11 items-center gap-1.5 border px-5 text-sm font-semibold',
                VIP_LIME_TEXT
              )
            : 'rounded-control border-vip/40 text-vip inline-flex h-10 items-center gap-1.5 border px-4 text-sm font-semibold'
        }
      >
        <HugeiconsIcon icon={CrownIcon} className='size-4' aria-hidden />
        {t('You are already VIP')}
      </span>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', props.className)}>
      {primary}
      {props.showLearnMore && (
        <Button
          size={buttonSize}
          variant='outline'
          className={cn(
            props.night &&
              'border-white/15 bg-white/5 text-white hover:bg-white/10'
          )}
          render={<Link to='/vip' onClick={() => follow('vip-page')} />}
        >
          {t('Learn about VIP')}
        </Button>
      )}
    </div>
  )
}
