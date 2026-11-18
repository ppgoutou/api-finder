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

import { useMembership } from '../hooks/use-membership'
import { useVipCompare } from '../hooks/use-vip-compare'
import { getVipSavingPercent } from '../lib/progress'
import { VIP_GOLD_TEXT } from '../lib/vip-style'
import { VipActions } from './vip-actions'
import { VipCompareTable } from './vip-compare-table'

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

  const savingPercent = getVipSavingPercent(info)
  let description = t(
    'VIP members run more tasks at once on dedicated lines and get 24/7 support.'
  )
  if (savingPercent > 0) {
    description = t(
      'VIP members save {{percent}}% on every model, run more tasks at once on dedicated lines and get 24/7 support.',
      { percent: savingPercent }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeCompare()
      }}
      title={
        <span className='flex items-center gap-2'>
          <HugeiconsIcon
            icon={CrownIcon}
            className={`size-5 ${VIP_GOLD_TEXT}`}
            aria-hidden
          />
          {t('Standard vs VIP')}
        </span>
      }
      description={description}
      footer={
        <VipActions
          info={info}
          source={`compare-dialog:${source}`}
          showLearnMore
          onNavigate={closeCompare}
          className='w-full justify-end'
        />
      }
    >
      <VipCompareTable info={info} />
    </Dialog>
  )
}
