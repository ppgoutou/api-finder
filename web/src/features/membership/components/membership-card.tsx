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
import { CheckmarkCircle02Icon, CrownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import { getVipBenefits } from '../lib/benefits'
import { getMembershipProgress } from '../lib/progress'
import type { MembershipInfo } from '../types'
import { VipCompareButton } from './vip-compare-button'
import { VipSupportContact } from './vip-support-contact'

interface MembershipCardProps {
  info: MembershipInfo
  className?: string
  /** Shown to standard users; takes them to the top-up form. */
  onTopUp?: () => void
}

/**
 * The user's tier on the wallet page: the VIP benefits, and either the
 * progress toward VIP or the VIP support contact.
 */
export function MembershipCard(props: MembershipCardProps) {
  const { t } = useTranslation()
  const info = props.info
  const isVip = info.is_vip === true
  const progress = getMembershipProgress(info)

  const benefits = getVipBenefits(info, t)
    .slice(0, 4)
    .map((benefit) => benefit.title)

  return (
    <Card data-card-hover='false' className={cn('py-0', props.className)}>
      <CardContent className='grid gap-6 p-4 sm:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-14'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='text-heading-3 sm:text-2xl'>
              {isVip ? t('VIP member') : t('Standard member')}
            </h3>
            {isVip && (
              <Badge className='bg-vip text-vip-foreground gap-1'>
                <HugeiconsIcon
                  icon={CrownIcon}
                  className='size-3.5'
                  aria-hidden
                />
                VIP
              </Badge>
            )}
          </div>
          <p className='text-muted-foreground mt-2 text-sm'>
            {isVip
              ? t('Your VIP prices apply to every request automatically.')
              : t(
                  'Become VIP automatically when your top-ups reach the threshold. Redemption codes count too.'
                )}
          </p>
          <ul className='mt-4 grid gap-2'>
            {benefits.map((benefit) => (
              <li key={benefit} className='flex items-center gap-2 text-sm'>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className='text-vip size-4 shrink-0'
                  aria-hidden
                />
                {benefit}
              </li>
            ))}
          </ul>
          <VipCompareButton
            source={isVip ? 'wallet-card-vip' : 'wallet-card'}
            className='mt-4 text-sm'
          />
        </div>

        <div className='min-w-0'>
          {isVip ? (
            <VipSupportContact handle={info.vip_support_telegram} />
          ) : (
            <MembershipProgressPanel
              info={info}
              percent={progress.percent}
              remainingQuota={progress.remainingQuota}
              onTopUp={props.onTopUp}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface MembershipProgressPanelProps {
  info: MembershipInfo
  percent: number
  remainingQuota: number
  onTopUp?: () => void
}

function MembershipProgressPanel(props: MembershipProgressPanelProps) {
  const { t } = useTranslation()
  const totalThreshold = props.info.total_threshold_quota
  const singleThreshold = props.info.single_threshold_quota

  return (
    <div className='flex flex-col gap-3'>
      {totalThreshold > 0 && (
        <div>
          <div className='flex items-baseline justify-between gap-3 text-sm'>
            <span className='text-muted-foreground'>{t('Total top-ups')}</span>
            <span className='font-semibold tabular-nums'>
              {formatQuota(props.info.paid_total_quota ?? 0)} /{' '}
              {formatQuota(totalThreshold)}
            </span>
          </div>
          <Progress
            value={props.percent}
            aria-label={t('Progress toward VIP')}
            className='mt-2'
          />
          <p className='text-muted-foreground mt-2 text-xs'>
            {t('{{amount}} more to become VIP', {
              amount: formatQuota(props.remainingQuota),
            })}
          </p>
        </div>
      )}
      {singleThreshold > 0 && (
        <p className='border-vip/30 bg-vip-soft rounded-lg border px-3 py-2 text-sm'>
          {t('Or top up {{amount}} at once to become VIP right away.', {
            amount: formatQuota(singleThreshold),
          })}
        </p>
      )}
      {props.onTopUp && (
        <Button className='w-full sm:w-auto' onClick={props.onTopUp}>
          {t('Top up now')}
        </Button>
      )}
    </div>
  )
}
