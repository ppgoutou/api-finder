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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { register } from '@/features/auth/api'
import { saveAffiliateCode } from '@/features/auth/lib/storage'
import zh from '@/i18n/locales/zh.json'

import { SignUpForm } from '../components/sign-up-form'

vi.mock('@/features/auth/api', () => ({
  register: vi.fn(),
  wechatLoginByCode: vi.fn(),
}))
vi.mock('@/features/auth/components/oauth-providers', () => ({
  OAuthProviders: () => null,
}))
vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    redirectToLogin: vi.fn(),
    handleLoginResult: vi.fn(),
  }),
}))
const statusState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: statusState.current }),
}))

const i18n = createInstance()

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { zh },
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  vi.mocked(register).mockReset()
  statusState.current = {}
  window.localStorage.clear()
})

function renderForm() {
  render(
    <I18nextProvider i18n={i18n}>
      <SignUpForm />
    </I18nextProvider>
  )
}

function fillAccount() {
  fireEvent.change(screen.getByLabelText('用户名'), {
    target: { value: 'newuser' },
  })
  fireEvent.change(screen.getByLabelText('密码'), {
    target: { value: 'password123' },
  })
  fireEvent.change(screen.getByLabelText('确认密码'), {
    target: { value: 'password123' },
  })
}

it('prefills the code remembered from an invitation link and submits it', async () => {
  saveAffiliateCode('V72X9N6C')
  vi.mocked(register).mockResolvedValue({ success: true, message: '' })
  renderForm()

  const codeInput = screen.getByLabelText('邀请码（选填）')
  expect(codeInput).toHaveValue('V72X9N6C')
  expect(screen.getByText('已通过邀请链接自动填入')).toBeVisible()

  fillAccount()
  fireEvent.click(screen.getByRole('button', { name: /注册|创建/ }))

  await vi.waitFor(() =>
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ aff_code: 'V72X9N6C' })
    )
  )
})

it('shows an invalid invitation code under the field', async () => {
  vi.mocked(register).mockResolvedValue({
    success: false,
    message: 'Invalid invitation code',
  })
  renderForm()

  fillAccount()
  fireEvent.change(screen.getByLabelText('邀请码（选填）'), {
    target: { value: 'NOPE0000' },
  })
  fireEvent.click(screen.getByRole('button', { name: /注册|创建/ }))

  expect(await screen.findByText('邀请码无效')).toBeVisible()
  expect(screen.getByLabelText('邀请码（选填）')).toHaveAttribute(
    'aria-invalid',
    'true'
  )
})

it('starts with the legal consent checked so the form can be submitted', () => {
  statusState.current = {
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
  }
  renderForm()

  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('button', { name: '创建账户' })).toBeEnabled()

  fireEvent.click(screen.getByRole('checkbox'))

  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('button', { name: '创建账户' })).toBeDisabled()
})
