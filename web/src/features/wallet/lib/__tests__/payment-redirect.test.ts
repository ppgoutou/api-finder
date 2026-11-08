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
import { afterEach, describe, expect, test, vi } from 'vitest'

import { redirectToPaymentPage } from '../payment'

describe('redirectToPaymentPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('https checkout link navigates the current tab instead of opening a popup', () => {
    const navigate = vi.fn()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    const redirected = redirectToPaymentPage(
      ' https://checkout.stripe.com/c/pay/cs_test_1 ',
      navigate
    )

    expect(redirected).toBe(true)
    expect(navigate).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_test_1'
    )
    expect(open).not.toHaveBeenCalled()
  })

  test.each([
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,hi'],
    ['relative path', '/console/topup'],
    ['empty link', ''],
  ])('%s is refused without navigating', (_name, url) => {
    const navigate = vi.fn()

    expect(redirectToPaymentPage(url, navigate)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
