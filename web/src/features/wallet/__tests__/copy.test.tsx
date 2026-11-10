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
import { act, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { BillingHistoryDialog } from '@/features/wallet/components/dialogs/billing-history-dialog'
import { PaymentConfirmDialog } from '@/features/wallet/components/dialogs/payment-confirm-dialog'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { formatCurrencyFromUSD } from '@/lib/currency'

import { RechargeFormCard } from '../components/recharge-form-card'

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
})

it('translates billing history statuses and updates them when the language changes', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 3,
        items: ['success', 'pending', 'expired'].map((status, id) => ({
          id,
          status,
          amount: 10,
          money: 10,
          trade_no: `order-${id}`,
          payment_method: 'stripe',
          create_time: 1,
        })),
      },
    },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )
  await screen.findByText('order-0')
  for (const label of ['成功', '待确认', '已过期']) {
    expect(screen.getByText(label)).toBeVisible()
  }
  await act(() => i18n.changeLanguage('en'))
  for (const label of ['Success', 'Pending', 'Expired']) {
    expect(screen.getByText(label)).toBeVisible()
  }
})

it('shows recharge presets as bare amounts without a USD credit note or payable amount before a payment method is chosen', async () => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: true,
          enable_stripe_topup: false,
          pay_methods: [],
          min_topup: 1,
          amount_options: [100, 20],
          discount: {},
        }}
        presetAmounts={[{ value: 100, discount: 0.8 }, { value: 20 }]}
        selectedPreset={null}
        topupAmount={1}
        amountUnit='USD'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={vi.fn()}
        onPaymentMethodSelect={vi.fn()}
      />
    </I18nextProvider>
  )
  expect(screen.queryByText(/美元额度/)).not.toBeInTheDocument()
  expect(screen.getByText('优惠 20%')).toBeVisible()
  expect(screen.getByLabelText('自定义金额（美元）')).toBeVisible()
  expect(screen.queryByText(/^支付 /)).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText('自定义金额')).toBeVisible()
  await act(() => i18n.changeLanguage('en'))
  expect(screen.queryByText(/USD credit/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Custom amount (USD)')).toBeVisible()
})

it('labels the custom amount in yuan without USD credit notes when amounts are entered in CNY', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: true,
          pay_methods: [],
          min_topup: 10,
          amount_options: [10],
          discount: {},
        }}
        presetAmounts={[{ value: 10 }]}
        selectedPreset={null}
        topupAmount={10}
        amountUnit='CNY'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={vi.fn()}
        onPaymentMethodSelect={vi.fn()}
      />
    </I18nextProvider>
  )
  expect(screen.getByLabelText('自定义金额（人民币）')).toBeVisible()
  expect(screen.queryByText(/美元额度/)).not.toBeInTheDocument()
})

it('shows a Stripe order credit from its USD money rather than its yuan amount', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 1,
        items: [
          {
            id: 1,
            status: 'success',
            amount: 68,
            money: 10,
            trade_no: 'order-cny',
            payment_method: 'stripe',
            create_time: 1,
          },
        ],
      },
    },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )
  await screen.findByText('order-cny')
  const format = { digitsLarge: 2, digitsSmall: 2, abbreviate: false }
  expect(screen.getByText(formatCurrencyFromUSD(10, format))).toBeVisible()
  expect(
    screen.queryByText(formatCurrencyFromUSD(68, format))
  ).not.toBeInTheDocument()
})

it.each([
  {
    type: 'stripe',
    name: 'Stripe',
    amount: 10,
    shown: /\$10\.00/,
    stripeNote: true,
  },
  {
    type: 'alipay',
    name: 'Alipay',
    amount: 68,
    shown: /¥68\.00/,
    stripeNote: false,
  },
])(
  'shows the $type payable amount with its charge currency',
  ({ type, name, amount, shown, stripeNote }) => {
    render(
      <I18nextProvider i18n={i18n}>
        <PaymentConfirmDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          topupAmount={10}
          paymentAmount={amount}
          paymentMethod={{ type, name }}
          calculating={false}
          processing={false}
        />
      </I18nextProvider>
    )
    expect(screen.getByText(shown)).toBeVisible()
    const note = screen.queryByText(/Stripe 支付页面/)
    if (stripeNote) {
      expect(note).toBeVisible()
    } else {
      expect(note).not.toBeInTheDocument()
    }
  }
)

function renderUsdtDialog(activeOrderExpiresAt?: number) {
  render(
    <I18nextProvider i18n={i18n}>
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        topupAmount={100}
        paymentAmount={14.705883}
        paymentMethod={{ type: 'usdt', name: 'USDT (TRC-20)' }}
        calculating={false}
        processing={false}
        usdtActiveOrderExpiresAt={activeOrderExpiresAt}
      />
    </I18nextProvider>
  )
}

it('warns before opening the old page when a USDT order has not expired', () => {
  renderUsdtDialog(1793864647)

  expect(screen.getByRole('alert')).toHaveTextContent(/未到期.*建议金额/)
  expect(screen.getByRole('button', { name: '打开付款页' })).toBeVisible()
  expect(screen.getByText(/14\.705883 USDT/)).toBeVisible()
})

it('keeps the usual USDT confirmation when no order is open', () => {
  renderUsdtDialog()

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认付款' })).toBeVisible()
})
