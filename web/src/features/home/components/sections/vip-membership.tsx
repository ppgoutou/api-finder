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

import {
  getVipSavingPercent,
  getVipUpgradeRule,
  useMembership,
  VipActions,
  VipBenefitGrid,
  VipCompareButton,
} from '@/features/membership'

/** The home page's VIP section: the headline benefits and how to get them. */
export function VipMembership() {
  const { t } = useTranslation()
  const { data: info } = useMembership()
  if (!info?.enabled) return null
  const savingPercent = getVipSavingPercent(info)
  const rule = getVipUpgradeRule(info, t)

  let title = t('VIP members get more out of every second')
  if (savingPercent > 0) {
    title = t('VIP members save {{percent}}% on every model', {
      percent: savingPercent,
    })
  }

  return (
    <section
      id='vip'
      className='relative z-10 scroll-mt-20 px-6 py-14 md:py-20'
    >
      <div className='rounded-panel border-vip/30 from-vip/15 via-vip/5 to-vip/10 mx-auto max-w-6xl border bg-gradient-to-br p-5 sm:p-8 lg:p-10'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='max-w-2xl'>
            <span className='border-vip/40 bg-vip-soft text-caption text-vip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold'>
              <HugeiconsIcon
                icon={CrownIcon}
                className='size-3.5'
                aria-hidden
              />
              {t('VIP membership')}
            </span>
            <h2 className='text-heading-2 mt-4'>{title}</h2>
            <p className='text-muted-foreground mt-3'>
              {rule
                ? t(
                    'Higher concurrency, dedicated priority lines and 24/7 support. {{rule}} and you are upgraded automatically, with no membership fee.',
                    { rule }
                  )
                : t(
                    'Higher concurrency, dedicated priority lines and 24/7 support, with no membership fee.'
                  )}
            </p>
          </div>
          <VipCompareButton source='home-section' variant='outline' />
        </div>
        <VipBenefitGrid info={info} limit={6} className='mt-8' />
        <VipActions
          info={info}
          source='home-section'
          showLearnMore
          className='mt-8'
        />
      </div>
    </section>
  )
}
