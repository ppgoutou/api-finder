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

import { RechargeFormCard } from '../components/recharge-form-card'
import type { PaymentMethod } from '../types'

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

function renderCard(topupAmount: number, onTopupAmountChange = vi.fn()) {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: true,
          pay_methods: [],
          min_topup: 10,
          amount_options: [],
          discount: {},
        }}
        presetAmounts={[]}
        selectedPreset={null}
        topupAmount={topupAmount}
        amountUnit='CNY'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={onTopupAmountChange}
        onPaymentMethodSelect={vi.fn()}
      />
    </I18nextProvider>
  )
  return screen.getByLabelText('自定义金额（人民币）')
}

it('keeps only the whole part when a decimal amount is entered', () => {
  const onChange = vi.fn()
  const input = renderCard(10, onChange)

  fireEvent.change(input, { target: { value: '12.5' } })

  expect(onChange).toHaveBeenLastCalledWith(12)
  expect(input).toHaveValue(12)
})

it('blocks the decimal point key in the custom amount', () => {
  const input = renderCard(10)

  const allowed = fireEvent.keyDown(input, { key: '.' })

  expect(allowed).toBe(false)
})

it('flags an amount below the minimum with an error message', () => {
  const input = renderCard(5)

  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('最低充值金额：10')).toBeVisible()
})

it('shows no minimum error at or above the minimum', () => {
  const input = renderCard(10)

  expect(input).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByText('最低充值金额：10')).not.toBeInTheDocument()
})

it('shows at most five presets and keeps the custom tile empty while a preset is selected', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: true,
          pay_methods: [],
          min_topup: 10,
          amount_options: [10, 20, 50, 100, 200, 500],
          discount: {},
        }}
        presetAmounts={[10, 20, 50, 100, 200, 500].map((value) => ({ value }))}
        selectedPreset={10}
        topupAmount={10}
        amountUnit='CNY'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={vi.fn()}
        onPaymentMethodSelect={vi.fn()}
      />
    </I18nextProvider>
  )

  expect(screen.getAllByRole('button')).toHaveLength(5)
  const custom = screen.getByLabelText('自定义金额（人民币）')
  expect(custom).not.toHaveValue()
  expect(custom).toHaveAttribute('placeholder', '自定义金额')
})

it('marks only the selected preset tile as pressed', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: true,
          pay_methods: [],
          min_topup: 10,
          amount_options: [50, 100],
          discount: {},
        }}
        presetAmounts={[50, 100].map((value) => ({ value }))}
        selectedPreset={100}
        topupAmount={100}
        amountUnit='CNY'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={vi.fn()}
        onPaymentMethodSelect={vi.fn()}
      />
    </I18nextProvider>
  )

  const [fifty, hundred] = screen.getAllByRole('button')
  expect(fifty).toHaveAttribute('aria-pressed', 'false')
  expect(hundred).toHaveAttribute('aria-pressed', 'true')
})

function renderPayMethods(
  topupAmount: number,
  onSelect = vi.fn(),
  payMethods: PaymentMethod[] = [{ name: 'Stripe', type: 'stripe' }]
) {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: true,
          pay_methods: payMethods,
          min_topup: 10,
          amount_options: [],
          discount: {},
        }}
        presetAmounts={[]}
        selectedPreset={null}
        topupAmount={topupAmount}
        amountUnit='CNY'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={vi.fn()}
        onPaymentMethodSelect={onSelect}
      />
    </I18nextProvider>
  )
  return onSelect
}

it('names the selected amount on the pay button and starts payment on click', () => {
  const onSelect = renderPayMethods(100)

  const pay = screen.getByRole('button', { name: /^Stripe 付款 .*100/ })
  fireEvent.click(pay)

  expect(onSelect).toHaveBeenCalledWith({ name: 'Stripe', type: 'stripe' })
})

it('disables the pay button below the minimum and states the minimum', () => {
  renderPayMethods(5)

  const pay = screen.getByRole('button', { name: /最低充值金额：10/ })
  expect(pay).toBeDisabled()
})

it('shows a paused method as a disabled button and blocks payment', () => {
  const onSelect = renderPayMethods(100, vi.fn(), [
    { name: 'Stripe', type: 'stripe', paused: true },
    { name: 'USDT', type: 'usdt' },
  ])

  const paused = screen.getByRole('button', { name: /^Stripe\. 暂不可用/ })
  expect(paused).toBeDisabled()
  fireEvent.click(paused)
  expect(onSelect).not.toHaveBeenCalled()
})

it('keeps the amounts usable when every method is paused', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: false,
          pay_methods: [{ name: 'Stripe', type: 'stripe', paused: true }],
          min_topup: 10,
          amount_options: [],
          discount: {},
        }}
        presetAmounts={[]}
        selectedPreset={null}
        topupAmount={100}
        amountUnit='CNY'
        paymentLoading={null}
        onSelectPreset={vi.fn()}
        onTopupAmountChange={vi.fn()}
        onPaymentMethodSelect={vi.fn()}
      />
    </I18nextProvider>
  )

  expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Stripe/ })).toBeDisabled()
})
