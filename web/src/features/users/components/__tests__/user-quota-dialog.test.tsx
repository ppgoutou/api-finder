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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { adjustUserQuota } from '../../api'
import { UserQuotaDialog } from '../user-quota-dialog'

vi.mock('../../api', () => ({ adjustUserQuota: vi.fn() }))

describe('UserQuotaDialog test credit mode', () => {
  beforeEach(() => {
    vi.mocked(adjustUserQuota).mockReset()
    vi.mocked(adjustUserQuota).mockResolvedValue({
      success: true,
    } as Awaited<ReturnType<typeof adjustUserQuota>>)
  })

  afterEach(() => {
    cleanup()
  })

  function renderDialog(onSuccess = vi.fn()) {
    render(
      <UserQuotaDialog
        open
        onOpenChange={vi.fn()}
        userId={7}
        currentQuota={0}
        onSuccess={onSuccess}
      />
    )
    return onSuccess
  }

  it('grants without asking for an amount when test credit is selected', async () => {
    const onSuccess = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Test credit' }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
    expect(adjustUserQuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, mode: 'test_credit' })
    )
  })

  it('still requires an amount in the add mode', async () => {
    renderDialog()

    expect(screen.getByRole('spinbutton')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(adjustUserQuota).not.toHaveBeenCalled()
  })
})
