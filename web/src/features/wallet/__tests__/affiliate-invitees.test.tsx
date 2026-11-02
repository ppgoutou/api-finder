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
import { fireEvent, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { formatQuota } from '@/lib/format'

import { getAffiliateInvitees } from '../api'
import { AffiliateInviteesCard } from '../components/affiliate-invitees-card'
import { generateAffiliateLink } from '../lib'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAffiliateInvitees: vi.fn(),
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
  vi.mocked(getAffiliateInvitees).mockReset()
})

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AffiliateInviteesCard />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

it('lists masked invitees with their status, rebate and total', async () => {
  vi.mocked(getAffiliateInvitees).mockResolvedValue({
    success: true,
    message: '',
    data: {
      total: 2,
      items: [
        {
          name: '胡**',
          email: 'a***@gmail.com',
          status: 1,
          created_at: 1,
          rebate_quota: 150000,
        },
        { name: 's**', email: '', status: 2, created_at: 2, rebate_quota: 0 },
      ],
    },
  })
  renderCard()

  expect(await screen.findByText('胡** · a***@gmail.com')).toBeVisible()
  expect(screen.getByText('s**')).toBeVisible()
  expect(screen.getByText('共 2 人')).toBeVisible()
  expect(screen.getByText('已启用')).toBeVisible()
  expect(screen.getByText('已禁用')).toBeVisible()
  expect(screen.getByText(formatQuota(150000))).toBeVisible()
  expect(screen.queryByRole('button', { name: '下一页' })).toBeNull()
})

it('shows the empty state when nobody has signed up yet', async () => {
  vi.mocked(getAffiliateInvitees).mockResolvedValue({
    success: true,
    message: '',
    data: { total: 0, items: [] },
  })
  renderCard()

  expect(await screen.findByText('暂无邀请记录')).toBeVisible()
})

it('requests the next page when more than one page exists', async () => {
  vi.mocked(getAffiliateInvitees).mockResolvedValue({
    success: true,
    message: '',
    data: {
      total: 11,
      items: [
        { name: 'u**', email: '', status: 1, created_at: 3, rebate_quota: 0 },
      ],
    },
  })
  renderCard()

  fireEvent.click(await screen.findByRole('button', { name: '下一页' }))

  await vi.waitFor(() =>
    expect(getAffiliateInvitees).toHaveBeenLastCalledWith(2, 10)
  )
})

it('points the invitation link at the home page', () => {
  expect(generateAffiliateLink('V72X9N6C')).toBe(
    `${window.location.origin}/?aff=V72X9N6C`
  )
})
