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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import {
  MediaStorageSettingsSection,
  type MediaStorageFormValues,
} from '../media-storage-settings-section'

const savedSettings: MediaStorageFormValues = {
  enabled: false,
  overseas_endpoint: 'https://account.r2.cloudflarestorage.com',
  overseas_region: 'auto',
  overseas_bucket: 'media',
  overseas_access_key_id: 'ak',
  overseas_access_secret: '',
  overseas_virtual_host: false,
  overseas_public_url: 'https://media.example.com',
  mainland_enabled: false,
  mainland_endpoint: '',
  mainland_region: '',
  mainland_bucket: '',
  mainland_access_key_id: '',
  mainland_access_secret: '',
  mainland_virtual_host: false,
  mainland_public_url: '',
  mainland_countries: 'CN',
  object_prefix: 'videos',
  retention_days: 0,
}

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <MediaStorageSettingsSection defaultValues={savedSettings} />
      </SettingsPageProvider>
    </>
  )
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: null },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

test('saving after enabling storage and typing a secret sends only the changed options and clears the secret field', async () => {
  const user = userEvent.setup()
  renderSettings()

  await user.click(screen.getByRole('switch', { name: 'Store generated videos' }))
  const secrets = screen.getAllByLabelText('Secret access key')
  await user.type(secrets[0], ' new-secret ')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'media_storage.enabled',
    value: true,
  })
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'media_storage.overseas_access_secret',
    value: 'new-secret',
  })
  await waitFor(() => expect(secrets[0]).toHaveValue(''))
})

test('a public URL without http(s) is rejected without saving', async () => {
  const user = userEvent.setup()
  renderSettings()

  const publicUrls = screen.getAllByLabelText('Public URL')
  await user.clear(publicUrls[0])
  await user.type(publicUrls[0], 'media.example.com')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  expect(
    await screen.findByText(
      'Provide a valid URL starting with http:// or https://'
    )
  ).toBeVisible()
  expect(api.put).not.toHaveBeenCalled()
})
