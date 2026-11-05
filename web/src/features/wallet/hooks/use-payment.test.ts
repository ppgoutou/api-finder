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
import { describe, expect, test } from 'vitest'

import { PAYMENT_TYPES } from '../constants'
import { requestPaymentAmount } from './use-payment'

describe('payment amount routing', () => {
  test('uses the dedicated Waffo amount calculator', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(120, PAYMENT_TYPES.WAFFO, {
      regular: async () => {
        calls.push('regular')
        return { success: true, data: '1' }
      },
      stripe: async () => {
        calls.push('stripe')
        return { success: true, data: '2' }
      },
      waffo: async (request) => {
        calls.push(`waffo:${request.amount}`)
        return { success: true, data: '18.75' }
      },
      waffoPancake: async () => {
        calls.push('pancake')
        return { success: true, data: '4' }
      },
      usdt: async () => {
        calls.push('usdt')
        return { success: true, data: '5' }
      },
    })

    expect(amount).toBe(18.75)
    expect(calls).toEqual(['waffo:120'])
  })

  test('uses the USDT quote with its six decimals for USDT payments', async () => {
    const other = async () => ({ success: true, data: '1' })

    const amount = await requestPaymentAmount(100, PAYMENT_TYPES.USDT, {
      regular: other,
      stripe: other,
      waffo: other,
      waffoPancake: other,
      usdt: async () => ({ success: true, data: '14.705883' }),
    })

    expect(amount).toBe(14.705883)
  })

  test('rejects with the server response as cause when the amount is refused', async () => {
    const refused = {
      success: false,
      message: 'error',
      data: 'Payment amount is too low',
    }
    const ok = async () => ({ success: true, data: '1' })

    await expect(
      requestPaymentAmount(1, PAYMENT_TYPES.STRIPE, {
        regular: ok,
        stripe: async () => refused,
        waffo: ok,
        waffoPancake: ok,
        usdt: ok,
      })
    ).rejects.toMatchObject({ cause: refused })
  })
})
