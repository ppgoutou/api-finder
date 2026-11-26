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
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handoffFromPrompt } from '@/features/video-studio/lib/prompt-handoff'
import { useStudioHandoff } from '@/stores/studio-handoff-store'

import { SignUp } from '..'

const search = vi.hoisted(() => ({ current: {} as { redirect?: string } }))
const formProps = vi.hoisted(() => ({ redirectTo: undefined as unknown }))

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search.current,
  Link: (props: { children: ReactNode; search?: { redirect?: string } }) => (
    <a data-redirect={props.search?.redirect ?? ''}>{props.children}</a>
  ),
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: {} }) }))
vi.mock('../../auth-layout', () => ({
  AuthLayout: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))
vi.mock('../../components/terms-footer', () => ({ TermsFooter: () => null }))
vi.mock('../components/sign-up-form', () => ({
  SignUpForm: (props: { redirectTo?: string }) => {
    formProps.redirectTo = props.redirectTo
    return null
  },
}))

afterEach(() => {
  cleanup()
  search.current = {}
  useStudioHandoff.getState().set(null)
})

describe('sign-up on the way to the studio', () => {
  it('shows the waiting prompt and passes the studio on to the form and sign-in', () => {
    search.current = { redirect: '/video-studio' }
    useStudioHandoff.getState().set(handoffFromPrompt('a fox in snow'))
    render(<SignUp />)

    expect(screen.getByText('Sign up, then generate this video')).toBeVisible()
    expect(screen.getByText('a fox in snow')).toBeVisible()
    expect(screen.getByText('Sign in').closest('a')).toHaveAttribute(
      'data-redirect',
      '/video-studio'
    )
    expect(formProps.redirectTo).toBe('/video-studio')
  })

  it('does not promise the video when the sign-up leads elsewhere', () => {
    search.current = { redirect: '/wallet' }
    useStudioHandoff.getState().set(handoffFromPrompt('a fox in snow'))
    render(<SignUp />)

    expect(
      screen.queryByText('Sign up, then generate this video')
    ).not.toBeInTheDocument()
  })
})
