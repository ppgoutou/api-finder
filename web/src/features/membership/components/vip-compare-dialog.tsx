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

import { Dialog } from '@/components/dialog'
import { cn } from '@/lib/utils'

import { useMembership } from '../hooks/use-membership'
import { useVipCompare } from '../hooks/use-vip-compare'
import { getVipUpgradeRule } from '../lib/benefits'
import { VIP_NIGHT_FILL, VIP_NIGHT_STAGE } from '../lib/vip-style'
import { VipActions } from './vip-actions'
import { VipCompareTable } from './vip-compare-table'
import { VipHighlights } from './vip-highlights'

/**
 * The standard-vs-VIP dialog every "compare benefits" trigger opens. The root
 * route mounts one; triggers open it through useVipCompare.
 */
export function VipCompareDialog() {
  const { t } = useTranslation()
  const open = useVipCompare((state) => state.open)
  const source = useVipCompare((state) => state.source)
  const closeCompare = useVipCompare((state) => state.closeCompare)
  const { data: info } = useMembership()
  if (!info?.enabled) return null

  const rule = getVipUpgradeRule(info, t)
  let description = t(
    'No membership fee: top up as usual and you are upgraded automatically.'
  )
  if (rule) {
    description = t(
      '{{rule}} and you are upgraded automatically, with no membership fee.',
      { rule }
    )
  }
  if (info.is_vip) {
    description = t(
      'You are VIP. Every benefit below already applies to your account.'
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCompare()
      }}
      contentClassName={cn(
        VIP_NIGHT_STAGE,
        'rounded-[28px] border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] sm:max-w-xl'
      )}
      title={
        <span className='flex items-center gap-2.5'>
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-xl',
              VIP_NIGHT_FILL
            )}
          >
            <HugeiconsIcon icon={CrownIcon} className='size-4' aria-hidden />
          </span>
          {t('VIP benefits')}
        </span>
      }
      description={description}
      titleClassName='text-xl font-semibold tracking-tight text-white'
      descriptionClassName='leading-relaxed text-white/55'
      bodyClassName='space-y-4'
      footerClassName='border-white/10 sm:border-t sm:bg-white/[0.03]'
      footer={
        <VipActions
          info={info}
          source={`compare-dialog:${source}`}
          showLearnMore
          onNavigate={closeCompare}
          night
          className='w-full justify-end'
        />
      }
    >
      <VipHighlights info={info} />
      <VipCompareTable info={info} />
    </Dialog>
  )
}
