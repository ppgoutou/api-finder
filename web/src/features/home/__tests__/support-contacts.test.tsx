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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SupportContacts } from '../components/support-contacts'

describe('SupportContacts', () => {
  it('offers Telegram and the Discord community without QQ', () => {
    render(<SupportContacts />)

    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Telegram:@APIFinder_Support'),
      expect.stringContaining('discord.gg/4ThRgPbn6Z'),
    ])
    expect(screen.queryByText(/QQ/)).toBeNull()
    expect(
      screen.getByRole('link', { name: '@APIFinder_Support' })
    ).toHaveAttribute('href', 'https://t.me/APIFinder_Support')
    expect(
      screen.getByRole('link', { name: 'discord.gg/4ThRgPbn6Z' })
    ).toHaveAttribute('href', 'https://discord.gg/4ThRgPbn6Z')
  })
})
