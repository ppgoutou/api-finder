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

import { formatQuota } from '@/lib/format'

import { getVipSavingPercent } from '../lib/progress'
import type { MembershipInfo } from '../types'

interface MembershipPriceNoteProps {
  info?: MembershipInfo
}

/**
 * One line on the pricing page: VIP users learn the prices shown are theirs,
 * everyone else how much VIP saves and how to qualify.
 */
export function MembershipPriceNote(props: MembershipPriceNoteProps) {
  const { t } = useTranslation()
  const info = props.info
  if (!info?.enabled) return null
  const savingPercent = getVipSavingPercent(info)
  if (savingPercent <= 0) return null

  let message = t(
    'VIP members save {{percent}}% on every model. Top up {{total}} in total or {{single}} at once to upgrade automatically.',
    {
      percent: savingPercent,
      total: formatQuota(info.total_threshold_quota),
      single: formatQuota(info.single_threshold_quota),
    }
  )
  if (info.is_vip) {
    message = t(
      'You are VIP: the prices below already include your {{percent}}% saving.',
      {
        percent: savingPercent,
      }
    )
  }

  return (
    <p className='mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs leading-relaxed text-amber-700 sm:text-sm dark:text-amber-300'>
      <HugeiconsIcon icon={CrownIcon} className='size-4 shrink-0' aria-hidden />
      <span>{message}</span>
      {!info.is_vip && (
        <Link to='/wallet' className='font-medium underline underline-offset-2'>
          {t('Top up now')}
        </Link>
      )}
    </p>
  )
}
