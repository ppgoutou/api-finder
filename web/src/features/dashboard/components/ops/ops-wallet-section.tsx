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

import {
  formatOpsMoney,
  OPS_CHANNEL_ALL,
  OPS_TREND_REDEMPTION,
  percentOf,
  reconcileWallet,
  walletRunwayDays,
} from '../../lib/ops'
import { PanelWrapper } from '../ui/panel-wrapper'
import { OpsFunnelList } from './ops-funnel'
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
  const runway = wallet ? walletRunwayDays(wallet) : null
  const testCredit = wallet?.test_credit
  const codesShown =
    props.channel === OPS_CHANNEL_ALL || props.channel === OPS_TREND_REDEMPTION
  const lifetimeCodes = codesShown
    ? (wallet?.other_credit.redemption_quota ?? 0)
    : 0

  // All time shows lifetime totals; a period shows only what happened in it.
  // Balances, debts and runway are always the current state.
  const stats: OpsStat[] = [
    {
      key: 'topup',
      label: t('Total top-ups'),
      value: money(
        props.allTime
          ? (wallet?.topup_quota ?? 0) + lifetimeCodes
          : (current?.topup_quota ?? 0) + (current?.redemption_quota ?? 0)
      ),
      hint: t('Orders net of refunds, plus redemption codes'),
    },
    {
      key: 'used',
      label: t('Amount used'),
      value: money(props.allTime ? wallet?.used_quota : current?.used_quota),
      hint: props.allTime
        ? t('Lifetime usage, including test credit')
        : t('Usage in this period, including test credit'),
    },
    {
      key: 'balance',
      label: t('Unused amount'),
      value: money(wallet?.balance_quota),
      hint: t('Current balance of all users'),
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
      key: 'negative',
      label: t('Negative balances'),
      value: money(Math.abs(wallet?.negative_quota ?? 0)),
      hint: t('{{count}} users owe right now', {
        count: wallet?.negative_users ?? 0,
      }),
    },
    {
      key: 'runway',
      label: t('Balance runway'),
      value:
        runway == null ? '—' : t('{{days}} days', { days: Math.floor(runway) }),
      hint: t('At the last 7 days of usage'),
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
          ? t(
              'Only total top-ups follow the top-up channel. Unused amount and negative balances are current.'
            )
          : t(
              'Figures cover the selected period. Unused amount, negative balances and runway are current.'
            )
      }
    >
      <OpsStatGrid
        stats={stats}
        loading={props.loading}
        fourColumns
        footer={
          props.allTime &&
          recon && (
            <div className='bg-muted/50 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t px-3 py-2.5 text-sm sm:px-5'>
              <span className='font-medium'>
                {t('All-channel reconciliation')}
              </span>
              <span className='font-mono tabular-nums'>
                {t('Top-ups {{topups}} + other {{other}} = {{total}}', {
                  topups: formatOpsMoney(recon.topups),
                  other: formatOpsMoney(recon.nonOrderCredit),
                  total: formatOpsMoney(recon.inflow),
                })}
              </span>
              <span className='text-muted-foreground'>≈</span>
              <span className='font-mono tabular-nums'>
                {t('Used + balance = {{total}}', {
                  total: formatOpsMoney(recon.outflow),
                })}
              </span>
              <span
                className='text-warning ml-auto font-mono font-semibold tabular-nums'
                title={t(
                  'Includes manual adjustments, sign-up bonuses, subscription payments from balance and deleted accounts, which have no structured record.'
                )}
              >
                {t('Difference {{amount}}', {
                  amount: formatOpsMoney(recon.difference),
                })}
              </span>
            </div>
          )
        }
      />
      <PanelWrapper
        title={t('Test credit conversion')}
        description={t(
          'Every user ever granted test credit. {{rate}} paid an order after their first grant.',
          {
            rate: formatPercent(
              percentOf(
                testCredit?.paid_after_users ?? 0,
                testCredit?.users ?? 0
              )
            ),
          }
        )}
        loading={props.loading}
        empty={(testCredit?.users ?? 0) === 0}
        height='h-40'
      >
        <OpsFunnelList
          steps={[
            {
              key: 'granted',
              label: t('Granted test credit'),
              value: testCredit?.users ?? 0,
            },
            {
              key: 'used-up',
              label: t('Used it all'),
              value: testCredit?.used_up_users ?? 0,
            },
            {
              key: 'paid',
              label: t('Paid afterwards'),
              value: testCredit?.paid_after_users ?? 0,
            },
          ]}
        />
      </PanelWrapper>
    </OpsSection>
  )
}
