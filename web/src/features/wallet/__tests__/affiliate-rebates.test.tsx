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

function renderCard(autoTransferTime?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AffiliateRebatesCard autoTransferTime={autoTransferTime} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

it('lists rebates by source and marks reversed ones', async () => {
  vi.mocked(getAffiliateRebates).mockResolvedValue({
    success: true,
    message: '',
    data: {
      total: 2,
      items: [
        {
          invitee_name: '胡**',
          invitee_email: 'a***@gmail.com',
          source_type: 'redemption',
          rebate_quota: 30000,
          status: 'credited',
          created_at: 2,
        },
        {
          invitee_name: '胡**',
          invitee_email: 'a***@gmail.com',
          source_type: 'topup',
          rebate_quota: 150000,
          status: 'reversed',
          created_at: 1,
        },
      ],
    },
  })
  renderCard('00:30')

  expect(await screen.findByText(`+${formatQuota(30000)}`)).toBeVisible()
  expect(screen.getByText('兑换码')).toBeVisible()
  expect(screen.getByText('充值')).toBeVisible()
  expect(screen.getByText('已撤回')).toBeVisible()
  expect(screen.getByText('每天 00:30 自动转入余额')).toBeVisible()
})

it('shows the empty state and no schedule when transfer is manual', async () => {
  vi.mocked(getAffiliateRebates).mockResolvedValue({
    success: true,
    message: '',
    data: { total: 0, items: [] },
  })
  renderCard('')

  expect(await screen.findByText('暂无返利记录')).toBeVisible()
  expect(screen.queryByText(/自动转入余额/)).toBeNull()
})
