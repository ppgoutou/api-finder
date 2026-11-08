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
import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import {
  calculateAmount,
  calculateStripeAmount,
  calculateUSDTAmount,
  calculateWaffoAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  requestUSDTPayment,
  isApiSuccess,
} from '../api'
import {
  isStripePayment,
  isUSDTPayment,
  isWaffoPayment,
  isWaffoPancakePayment,
  redirectToPaymentPage,
  submitPaymentForm,
} from '../lib'
import type { AmountRequest, AmountResponse } from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

type AmountCalculator = (request: AmountRequest) => Promise<AmountResponse>

export interface PaymentAmountCalculators {
  regular: AmountCalculator
  stripe: AmountCalculator
  waffo: AmountCalculator
  waffoPancake: AmountCalculator
  usdt: AmountCalculator
}

const defaultPaymentAmountCalculators: PaymentAmountCalculators = {
  regular: calculateAmount,
  stripe: calculateStripeAmount,
  waffo: calculateWaffoAmount,
  waffoPancake: calculateWaffoPancakeAmount,
  usdt: calculateUSDTAmount,
}

export async function requestPaymentAmount(
  topupAmount: number,
  paymentType: string,
  calculators: PaymentAmountCalculators = defaultPaymentAmountCalculators
): Promise<number> {
  let calculator = calculators.regular
  if (isStripePayment(paymentType)) {
    calculator = calculators.stripe
  } else if (isWaffoPayment(paymentType)) {
    calculator = calculators.waffo
  } else if (isWaffoPancakePayment(paymentType)) {
    calculator = calculators.waffoPancake
  } else if (isUSDTPayment(paymentType)) {
    calculator = calculators.usdt
  }

  const response = await calculator({ amount: topupAmount })
  if (!isApiSuccess(response) || !response.data) {
    // Carries the server's reason (e.g. amount too low) to the caller.
    throw createServerError(response)
  }

  return Number.parseFloat(response.data)
}

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [usdtActiveOrderExpiresAt, setUsdtActiveOrderExpiresAt] = useState<
    number | undefined
  >()

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)
        setUsdtActiveOrderExpiresAt(undefined)
        const calculatedAmount = await requestPaymentAmount(
          topupAmount,
          paymentType,
          {
            ...defaultPaymentAmountCalculators,
            usdt: async (request) => {
              const response = await calculateUSDTAmount(request)
              setUsdtActiveOrderExpiresAt(response.active_order?.expires_at)
              return response
            },
          }
        )
        setAmount(calculatedAmount)
        return calculatedAmount
      } catch (error) {
        handleServerError(error, i18next.t('Payment request failed'))
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const amount = Math.floor(topupAmount)

        if (isUSDTPayment(paymentType)) {
          const response = await requestUSDTPayment({ amount })
          if (!isApiSuccess(response) || !response.data?.pay_link) {
            handleServerError(response, i18next.t('Payment request failed'))
            return false
          }
          if (!redirectToPaymentPage(response.data.pay_link)) {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
          if (response.data.reused) {
            toast.info(
              i18next.t(
                'You have an unfinished USDT order, so its payment page was opened. Whatever you send to it is credited by the amount received.'
              )
            )
          } else {
            toast.success(i18next.t('Redirecting to payment page...'))
          }
          return true
        }

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : await requestPayment({
              amount,
              payment_method: paymentType,
            })

        if (!isApiSuccess(response)) {
          handleServerError(response, i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        if (isStripe && response.data?.pay_link) {
          if (!redirectToPaymentPage(response.data.pay_link as string)) {
            toast.error(i18next.t('Invalid payment redirect URL'))
            return false
          }
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        // Handle non-Stripe payment
        if (!isStripe && response.data) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            submitPaymentForm(url, response.data)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (error) {
        handleServerError(error, i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
    usdtActiveOrderExpiresAt,
  }
}
