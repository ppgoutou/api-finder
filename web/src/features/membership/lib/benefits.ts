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
import type { TFunction } from 'i18next'

import { formatQuota } from '@/lib/format'

import type { MembershipInfo } from '../types'
import { getVipSavingPercent } from './progress'

export type VipBenefitId =
  | 'price'
  | 'concurrency'
  | 'lines'
  | 'support'
  | 'early-access'
  | 'integration'
  | 'no-fee'

/** One VIP benefit, with the line a standard member gets instead. */
export interface VipBenefit {
  id: VipBenefitId
  /** What the row compares, such as "Model prices". */
  label: string
  /** Short headline of the VIP side. */
  title: string
  /** One or two sentences explaining the benefit. */
  description: string
  standard: string
  vip: string
}

/**
 * The VIP benefits in the order every VIP surface lists them. The price row
 * needs a VIP group that is really cheaper, and the concurrency row needs
 * both concurrency figures.
 */
export function getVipBenefits(
  info: MembershipInfo,
  t: TFunction
): VipBenefit[] {
  const benefits: VipBenefit[] = []
  const savingPercent = getVipSavingPercent(info)
  if (savingPercent > 0) {
    benefits.push({
      id: 'price',
      label: t('Model prices'),
      title: t('{{percent}}% off every model', { percent: savingPercent }),
      description: t(
        'VIP prices apply to every video, image and chat model automatically, on the site and through the API.'
      ),
      standard: t('Standard price'),
      vip: t('{{percent}}% off every model', { percent: savingPercent }),
    })
  }

  const standardConcurrency = info.standard_concurrency ?? 0
  const vipConcurrency = info.vip_concurrency ?? 0
  if (standardConcurrency > 0 && vipConcurrency > 0) {
    benefits.push({
      id: 'concurrency',
      label: t('Concurrency'),
      title: t('High concurrency'),
      description: t(
        'Run about {{vip}} generation tasks at once, against about {{standard}} for standard members, so batch jobs and busy hours do not queue.',
        { vip: vipConcurrency, standard: standardConcurrency }
      ),
      standard: t('About {{count}} tasks at once', {
        count: standardConcurrency,
      }),
      vip: t('About {{count}} tasks at once', { count: vipConcurrency }),
    })
  }

  benefits.push(
    {
      id: 'lines',
      label: t('Lines'),
      title: t('Dedicated lines, served first'),
      description: t(
        'VIP requests run on dedicated, more stable upstream lines and are scheduled first when traffic peaks.'
      ),
      standard: t('Shared lines'),
      vip: t('Dedicated lines, served first'),
    },
    {
      id: 'support',
      label: t('Support'),
      title: t('24/7 dedicated support'),
      description: t(
        'A dedicated Telegram account answers VIP members around the clock, with faster replies on outages and billing questions.'
      ),
      standard: t('Regular support'),
      vip: t('24/7 dedicated support'),
    },
    {
      id: 'early-access',
      label: t('New models'),
      title: t('Early access to new models'),
      description: t(
        'Try new models and features first, and hear about launches and price drops before anyone else.'
      ),
      standard: t('When generally available'),
      vip: t('Early access'),
    },
    {
      id: 'integration',
      label: t('Integration help'),
      title: t('One-to-one integration help'),
      description: t(
        'Our engineers help you connect the API, tune parameters and troubleshoot failed tasks.'
      ),
      standard: t('Docs and FAQ'),
      vip: t('One-to-one help'),
    },
    {
      id: 'no-fee',
      label: t('Membership fee'),
      title: t('No membership fee'),
      description: t(
        'There is nothing to subscribe to or renew: once your top-ups qualify, you stay VIP.'
      ),
      standard: t('No fee'),
      vip: t('No fee, no renewal'),
    }
  )
  return benefits
}

/** How a standard member qualifies, or null when no threshold is set. */
export function getVipUpgradeRule(
  info: MembershipInfo,
  t: TFunction
): string | null {
  const total = info.total_threshold_quota
  const single = info.single_threshold_quota
  if (total > 0 && single > 0) {
    return t('Top up {{total}} in total or {{single}} at once', {
      total: formatQuota(total),
      single: formatQuota(single),
    })
  }
  if (total > 0) {
    return t('Top up {{total}} in total', { total: formatQuota(total) })
  }
  if (single > 0) {
    return t('Top up {{single}} at once', { single: formatQuota(single) })
  }
  return null
}
