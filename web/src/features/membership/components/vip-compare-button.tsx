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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useMembership } from '../hooks/use-membership'
import { useVipCompare } from '../hooks/use-vip-compare'
import { VIP_GOLD_FILL, VIP_GOLD_TEXT } from '../lib/vip-style'

interface VipCompareButtonProps {
  /** Where the button sits, for analytics. */
  source: string
  /** "link" reads as inline text; "chip" is a small gold pill. */
  variant?: 'link' | 'chip' | 'outline'
  /** Replaces the default "Compare VIP benefits" label. */
  label?: string
  /** Hide the button from VIP members, for upgrade prompts. */
  standardOnly?: boolean
  className?: string
}

/** Opens the standard-vs-VIP dialog; hidden while the VIP program is off. */
export function VipCompareButton(props: VipCompareButtonProps) {
  const { t } = useTranslation()
  const { data: info } = useMembership()
  const openCompare = useVipCompare((state) => state.openCompare)
  if (!info?.enabled) return null
  if (props.standardOnly && info.is_vip) return null

  const label = props.label ?? t('Compare VIP benefits')
  const variant = props.variant ?? 'link'
  const onClick = () => openCompare(props.source)

  if (variant === 'link') {
    return (
      <button
        type='button'
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline',
          VIP_GOLD_TEXT,
          props.className
        )}
      >
        <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
        {label}
      </button>
    )
  }

  return (
    <Button
      type='button'
      size='sm'
      variant={variant === 'outline' ? 'outline' : 'default'}
      onClick={onClick}
      className={cn(
        'rounded-full font-semibold',
        variant === 'chip'
          ? VIP_GOLD_FILL
          : cn('border-amber-500/50', VIP_GOLD_TEXT),
        props.className
      )}
    >
      <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
      {label}
    </Button>
  )
}
