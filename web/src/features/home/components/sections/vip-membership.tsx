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
      <div className='mx-auto max-w-6xl rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-orange-400/10 p-5 sm:p-8 lg:p-10'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='max-w-2xl'>
            <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200'>
              <HugeiconsIcon
                icon={CrownIcon}
                className='size-3.5'
                aria-hidden
              />
              {t('VIP membership')}
            </span>
            <h2 className='mt-4 text-3xl font-bold tracking-tight md:text-4xl'>
              {title}
            </h2>
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
