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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { formatQuota } from '@/lib/format'

import { getAffiliateRebates } from '../api'
import { AffiliateRebatesCard } from '../components/affiliate-rebates-card'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAffiliateRebates: vi.fn(),
}))

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

afterEach(() => {
  vi.mocked(getAffiliateRebates).mockReset()
})

function renderCard(holdDays?: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AffiliateRebatesCard holdDays={holdDays} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

const rebate = {
  invitee_name: '胡**',
  invitee_email: 'a***@gmail.com',
  created_at: 1,
}

it('shows when a pending rebate arrives, and marks arrived and reversed ones', async () => {
  const availableAt = dayjs('2026-11-09T12:00:00').unix()
  vi.mocked(getAffiliateRebates).mockResolvedValue({
    success: true,
    message: '',
    data: {
      total: 3,
      items: [
        {
          ...rebate,
          source_type: 'redemption',
          rebate_quota: 30000,
          status: 'pending',
          available_at: availableAt,
        },
        {
          ...rebate,
          source_type: 'topup',
          rebate_quota: 150000,
          status: 'settled',
          available_at: 1,
        },
        {
          ...rebate,
          source_type: 'topup',
          rebate_quota: 60000,
          status: 'reversed',
          available_at: 1,
        },
      ],
    },
  })
  renderCard(7)

  expect(await screen.findByText(`+${formatQuota(30000)}`)).toBeVisible()
  expect(screen.getByText('2026-11-09 到账')).toBeVisible()
  expect(screen.getByText('已到账')).toBeVisible()
  expect(screen.getByText('已撤回')).toBeVisible()
  expect(screen.getByText('兑换码')).toBeVisible()
  expect(screen.getByText('每笔返利获得 7 天后到账')).toBeVisible()
})

it('shows the empty state without a holding note when rebates pay at once', async () => {
  vi.mocked(getAffiliateRebates).mockResolvedValue({
    success: true,
    message: '',
    data: { total: 0, items: [] },
  })
  renderCard(0)

  expect(await screen.findByText('暂无返利记录')).toBeVisible()
  expect(screen.queryByText(/天后到账/)).toBeNull()
})
