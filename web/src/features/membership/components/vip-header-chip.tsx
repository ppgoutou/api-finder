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

import { cn } from '@/lib/utils'

import { useMembership } from '../hooks/use-membership'
import { useVipCompare } from '../hooks/use-vip-compare'
import { VIP_GOLD_FILL } from '../lib/vip-style'

interface VipHeaderChipProps {
  /** Show the crown and "VIP" only, for narrow headers. */
  compact?: boolean
  className?: string
}

/**
 * The VIP pill in the top bar. VIP members see their tier; everyone else an
 * invitation to upgrade. Both open the standard-vs-VIP dialog.
 */
export function VipHeaderChip(props: VipHeaderChipProps) {
  const { t } = useTranslation()
  const { data: info } = useMembership()
  const openCompare = useVipCompare((state) => state.openCompare)
  if (!info?.enabled) return null

  const isVip = info.is_vip === true
  let label = t('VIP benefits')
  if (info.signed_in) label = t('Upgrade to VIP')
  if (isVip || props.compact) label = 'VIP'

  return (
    // oxlint-disable-next-line design/no-raw-button -- pill chip in the header
    <button
      type='button'
      onClick={() => openCompare(isVip ? 'header-vip' : 'header-upgrade')}
      aria-label={isVip ? t('Your VIP benefits') : t('Compare VIP benefits')}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition-colors',
        isVip
          ? VIP_GOLD_FILL
          : 'border border-vip/50 bg-vip-soft text-vip hover:bg-vip/20',
        props.className
      )}
    >
      <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
      {label}
    </button>
  )
}
