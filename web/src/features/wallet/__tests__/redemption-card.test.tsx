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
import { fireEvent, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { RedemptionCard } from '../components/redemption-card'

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

function renderCard(
  overrides: Partial<Parameters<typeof RedemptionCard>[0]> = {}
) {
  const props = {
    redemptionEnabled: true,
    redemptionCode: '',
    onRedemptionCodeChange: vi.fn(),
    onRedeem: vi.fn(),
    redeeming: false,
    ...overrides,
  }
  render(
    <I18nextProvider i18n={i18n}>
      <RedemptionCard {...props} />
    </I18nextProvider>
  )
  return props
}

it('links the buy button to the configured shop in a new tab', () => {
  renderCard({ topupLink: 'https://shop.example/store' })

  const link = screen.getByRole('link', { name: /购买兑换码/ })
  expect(link).toHaveAttribute('href', 'https://shop.example/store')
  expect(link).toHaveAttribute('target', '_blank')
  expect(screen.getByText('去小店下单')).toBeVisible()
  expect(screen.getByText('兑换后额度永久有效')).toBeVisible()
})

it('places the code input between the steps and the buy button', () => {
  renderCard({ topupLink: 'https://shop.example/store' })

  const firstStep = screen.getByText('去小店下单')
  const codeInput = screen.getByLabelText('输入兑换码')
  const buyLink = screen.getByRole('link', { name: /购买兑换码/ })

  expect(firstStep.compareDocumentPosition(codeInput)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  )
  expect(codeInput.compareDocumentPosition(buyLink)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  )
})

it('hides the buy panel when no shop link is configured', () => {
  renderCard()

  expect(
    screen.queryByRole('link', { name: /购买兑换码/ })
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('输入兑换码')).toBeVisible()
})

it('passes the typed code up and redeems on click', () => {
  const props = renderCard()

  fireEvent.change(screen.getByLabelText('输入兑换码'), {
    target: { value: 'abc123' },
  })
  fireEvent.click(screen.getByRole('button', { name: '兑换额度' }))

  expect(props.onRedemptionCodeChange).toHaveBeenCalledWith('abc123')
  expect(props.onRedeem).toHaveBeenCalledOnce()
})

it('replaces the code input with a notice while redemption is disabled', () => {
  renderCard({ redemptionEnabled: false, topupLink: 'https://shop.example' })

  expect(screen.queryByLabelText('输入兑换码')).not.toBeInTheDocument()
  expect(
    screen.getByText(/兑换码/, { selector: '[data-slot="alert-description"]' })
  ).toBeVisible()
})

it('links redemption records to the shop order lookup in a new tab', () => {
  renderCard()

  const records = screen.getByRole('link', { name: /兑换记录/ })
  expect(records).toHaveAttribute('href', 'https://wzyp.cn/order')
  expect(records).toHaveAttribute('target', '_blank')
})

it('shows only a skeleton, without the title, while top-up info loads', () => {
  renderCard({ loading: true, topupLink: 'https://shop.example/store' })

  expect(screen.getByTestId('redemption-card-skeleton')).toBeInTheDocument()
  expect(screen.queryByText('兑换码充值')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('输入兑换码')).not.toBeInTheDocument()
})
