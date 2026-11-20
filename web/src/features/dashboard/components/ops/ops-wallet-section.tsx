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
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatPercent } from '@/lib/format'

import { formatOpsMoney, percentOf, reconcileWallet } from '../../lib/ops'
import {
  OpsSection,
  OpsStatGrid,
  type OpsSectionProps,
  type OpsStat,
} from './ops-stat-grid'

export function OpsWalletSection(props: OpsSectionProps) {
  const { t } = useTranslation()
  const data = props.data
  const current = data?.current
  const wallet = data?.wallet
  const money = (value: number | undefined) => formatOpsMoney(value ?? 0)
  const recon = wallet ? reconcileWallet(wallet) : null
  const testCredit = wallet?.test_credit

  // All time shows lifetime totals; a period shows only what happened in it.
  // Top-ups are cash revenue in the overview, and balances are live figures
  // at the top of the page.
  const stats: OpsStat[] = [
    {
      key: 'used',
      label: t('Amount used'),
      value: money(props.allTime ? wallet?.used_quota : current?.used_quota),
      hint: props.allTime
        ? t('Lifetime usage, including test credit')
        : t('Usage in this period, including test credit'),
    },
    {
      key: 'other',
      label: t('Other credits'),
      value: money(
        props.allTime ? recon?.otherCredit : current?.other_credit_quota
      ),
      hint: t('Rebates and check-ins'),
    },
    {
      key: 'test-granted',
      label: t('Test credit granted'),
      value: money(
        props.allTime ? testCredit?.granted_quota : current?.test_credit_quota
      ),
      hint: props.allTime
        ? t('{{count}} users, promotional cost with no revenue', {
            count: testCredit?.users ?? 0,
          })
        : t('Promotional cost with no revenue'),
    },
    ...(props.allTime
      ? [
          {
            key: 'test-used',
            label: t('Test credit used'),
            value: money(testCredit?.used_quota),
            hint: t('Estimated, assuming test credit is spent first'),
            note: t('Paid usage {{amount}}', {
              amount: money(
                Math.max(
                  (wallet?.used_quota ?? 0) - (testCredit?.used_quota ?? 0),
                  0
                )
              ),
            }),
          },
        ]
      : []),
    {
      key: 'test-conversion',
      label: t('Test credit conversion'),
      value: formatPercent(
        percentOf(testCredit?.paid_after_users ?? 0, testCredit?.users ?? 0)
      ),
      hint: t('Granted {{granted}} · used up {{usedUp}} · paid after {{paid}}', {
        granted: testCredit?.users ?? 0,
        usedUp: testCredit?.used_up_users ?? 0,
        paid: testCredit?.paid_after_users ?? 0,
      }),
      note: t('All time'),
    },
  ]

  return (
    <OpsSection
      id='ops-wallet'
      index={1}
      tone='wallet'
      icon={Wallet}
      title={t('Wallet')}
      description={
        props.allTime
          ? t('Lifetime figures. Test credit conversion covers every user ever granted it.')
          : t('Figures cover the selected period. Test credit conversion covers all time.')
      }
    >
      <OpsStatGrid
        stats={stats}
        loading={props.loading}
        columns={props.allTime ? 5 : 4}
      />
    </OpsSection>
  )
}
