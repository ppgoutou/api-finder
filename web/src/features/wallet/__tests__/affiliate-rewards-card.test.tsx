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
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { formatQuota } from '@/lib/format'

import { AffiliateRewardsCard } from '../components/affiliate-rewards-card'
import type { AffiliateSummary, UserWalletData } from '../types'

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { zh },
    interpolation: { escapeValue: false },
  })
})

const summary: AffiliateSummary = {
  invitee_count: 8,
  pending_quota: 30000,
  earned_quota: 180000,
  rebate_percent: 3,
  hold_days: 7,
}

function renderCard(
  overrides: { summary?: AffiliateSummary; affQuota?: number } = {}
) {
  const onTransfer = vi.fn()
  render(
    <I18nextProvider i18n={i18n}>
      <AffiliateRewardsCard
        user={{ aff_quota: overrides.affQuota ?? 0 } as UserWalletData}
        affiliateCode='V72X9N6C'
        affiliateLink='https://api-finder.com/?aff=V72X9N6C'
        summary={overrides.summary ?? summary}
        onTransfer={onTransfer}
      />
    </I18nextProvider>
  )
  return onTransfer
}

it('explains the rebate rules with the configured percentage and days', () => {
  renderCard()

  const guide = screen.getByRole('region', { name: '邀请返利规则' })
  expect(guide).toHaveTextContent('你获得 3% 返利')
  expect(guide).toHaveTextContent('7 天后自动转入余额')
  expect(screen.getByText(formatQuota(30000))).toBeVisible()
  expect(screen.getByText(formatQuota(180000))).toBeVisible()
  expect(screen.getByText('8')).toBeVisible()
})

it('follows a changed percentage and pays at once when days is 0', () => {
  renderCard({ summary: { ...summary, rebate_percent: 5, hold_days: 0 } })

  const guide = screen.getByRole('region', { name: '邀请返利规则' })
  expect(guide).toHaveTextContent('你获得 5% 返利')
  expect(guide).toHaveTextContent('10 分钟内转入余额')
})

it('says rebates are not open when the percentage is 0', () => {
  renderCard({ summary: { ...summary, rebate_percent: 0 } })

  expect(screen.getByText(/邀请返利暂未开启/)).toBeVisible()
})

it('offers manual transfer only for earlier invitation rewards', () => {
  renderCard()
  expect(screen.queryByRole('button', { name: '转移到余额' })).toBeNull()
})

it('shows the transfer button when earlier rewards remain', () => {
  renderCard({ affQuota: 500000 })

  expect(screen.getByRole('button', { name: '转移到余额' })).toBeVisible()
})
