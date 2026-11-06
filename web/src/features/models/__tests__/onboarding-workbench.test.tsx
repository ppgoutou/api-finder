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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { pricingOptions } from '@/features/model-pricing/pricing'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { OnboardingSection } from '../components/onboarding/onboarding-section'

const alpha = { id: 1, name: 'alpha', type: 1, group: 'default,vip', status: 1 }
const beta = { id: 2, name: 'beta', type: 1, group: 'default', status: 1 }
const gamma = {
  id: 5,
  name: 'gamma',
  type: 61,
  group: 'default',
  status: 1,
  plugin_missing: true,
}

const overview = {
  items: [
    {
      model_name: 'gpt-new',
      pending_channels: [alpha, beta, gamma],
      removed_channels: [],
      channels: [],
      metadata_id: 0,
    },
    {
      model_name: 'gpt-done',
      pending_channels: [],
      removed_channels: [],
      channels: [alpha],
      metadata_id: 3,
    },
    {
      model_name: 'gpt-gone',
      pending_channels: [],
      removed_channels: [alpha, beta],
      channels: [alpha, beta],
      metadata_id: 4,
    },
  ],
  tags: ['chat'],
}

const categories = [
  { id: 'chat', name: 'Chat', description: '', models: ['gpt-done'] },
]

const upstreamReport = {
  channels: [
    {
      id: 1,
      name: 'alpha',
      base_url: 'https://supplier.test',
      has_token: true,
      baseline_time: 1,
      latest_time: 2,
    },
  ],
  changes: [
    {
      channel_id: 1,
      channel_name: 'alpha',
      model_name: 'gpt-done',
      kind: 'changed',
      fields: [{ field: 'model_ratio', previous: 1, current: 1.5 }],
    },
    {
      channel_id: 1,
      channel_name: 'alpha',
      model_name: '',
      kind: 'group_ratio',
      fields: [{ field: 'vip', previous: 1.2, current: 1 }],
    },
  ],
  models: {
    'gpt-done': {
      channel_id: 1,
      channel_name: 'alpha',
      pricing: { ModelRatio: 1.5 },
      in_sync: false,
    },
  },
}

function signInAsRoot() {
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'administrator', role: 100 })
}

function mockApi(
  report = upstreamReport,
  overviewData: { items: object[]; tags: string[] } = overview
) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/models/onboarding/upstream_prices') {
      return { data: { success: true, data: report } }
    }
    if (url === '/api/option/model_pricing') {
      const effective = { ModelRatio: 1 }
      return {
        data: {
          success: true,
          data: {
            entries: [
              {
                model_name: 'gpt-done',
                version: 'v1',
                configured: effective,
                effective,
              },
            ],
            options: pricingOptions({}),
            empty_version: 'empty',
          },
        },
      }
    }
    if (url === '/api/models/onboarding') {
      return { data: { success: true, data: overviewData } }
    }
    if (url === '/api/system-task/list') {
      return { data: { success: true, data: [], total: 0 } }
    }
    if (url === '/api/option/') {
      return {
        data: {
          success: true,
          data: [
            { key: 'PricingCategories', value: JSON.stringify(categories) },
          ],
        },
      }
    }
    if (url === '/api/vendors/') {
      return {
        data: {
          success: true,
          data: { items: [], total: 0, page: 1, page_size: 1000 },
        },
      }
    }
    throw new Error(`unexpected GET ${url}`)
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  return { post, put }
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OnboardingSection />
    </QueryClientProvider>
  )
}

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})

describe('model onboarding workbench', () => {
  it('removes a delisted model only from the checked channels after confirmation', async () => {
    const user = userEvent.setup()
    const { post } = mockApi()
    renderSection()

    await user.click(
      await screen.findByRole('tab', { name: /Delisted upstream/ })
    )
    await user.click(screen.getByRole('button', { name: /gpt-gone/ }))
    const delisted = screen
      .getByRole('heading', { name: 'Delisted upstream' })
      .closest('section') as HTMLElement
    await user.click(within(delisted).getAllByRole('checkbox')[1])
    await user.click(
      within(delisted).getByRole('button', {
        name: 'Remove from selected channels',
      })
    )
    expect(post).not.toHaveBeenCalled()
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Remove',
      })
    )

    await waitFor(() => expect(post).toHaveBeenCalledOnce())
    expect(post).toHaveBeenCalledWith('/api/channel/upstream_updates/apply', {
      id: 1,
      remove_models: ['gpt-gone'],
    })
  })

  it('lists unfinished models under To do and every model under All', async () => {
    const user = userEvent.setup()
    mockApi()
    renderSection()

    expect(await screen.findByRole('button', { name: /gpt-new/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /gpt-done/ })).toBeNull()

    await user.click(screen.getByRole('tab', { name: /All/ }))

    expect(screen.getByRole('button', { name: /gpt-done/ })).toBeVisible()
  })

  it('ignores the checked models through the workbench and offers restoring ignored ones', async () => {
    const user = userEvent.setup()
    const { post } = mockApi()
    renderSection()

    await user.click(
      await screen.findByRole('checkbox', { name: 'Select gpt-new' })
    )
    await user.click(screen.getByRole('button', { name: 'Ignore 1 selected' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/models/onboarding/ignore', {
        model_names: ['gpt-new'],
        ignored: true,
      })
    )
  })

  it('moves an ignored model from To do to Ignored and restores it from the editor', async () => {
    const user = userEvent.setup()
    const { post } = mockApi(upstreamReport, {
      ...overview,
      items: overview.items.map((item) =>
        item.model_name === 'gpt-new' ? { ...item, ignored: true } : item
      ),
    })
    renderSection()

    await screen.findByRole('tab', { name: /Ignored \(1\)/ })
    expect(screen.queryByRole('button', { name: /gpt-new/ })).toBeNull()

    await user.click(screen.getByRole('tab', { name: /Ignored/ }))
    await user.click(screen.getByRole('button', { name: /gpt-new/ }))
    await user.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/models/onboarding/ignore', {
        model_names: ['gpt-new'],
        ignored: false,
      })
    )
  })

  it('adds the selected model only to the checked upstream channels', async () => {
    const user = userEvent.setup()
    const { post } = mockApi()
    renderSection()

    await user.click(await screen.findByRole('button', { name: /gpt-new/ }))
    const channels = screen
      .getByRole('heading', { name: 'Offered by upstream' })
      .closest('section') as HTMLElement
    await user.click(within(channels).getAllByRole('checkbox')[1])
    await user.click(
      within(channels).getByRole('button', {
        name: 'Add to selected channels',
      })
    )

    await waitFor(() => expect(post).toHaveBeenCalledOnce())
    expect(post).toHaveBeenCalledWith('/api/channel/upstream_updates/apply', {
      id: 1,
      add_models: ['gpt-new'],
    })
  })

  it('leaves a channel whose plugin lacks the model unchecked and marked', async () => {
    const user = userEvent.setup()
    mockApi()
    renderSection()

    await user.click(await screen.findByRole('button', { name: /gpt-new/ }))
    const channels = screen
      .getByRole('heading', { name: 'Offered by upstream' })
      .closest('section') as HTMLElement
    const boxes = within(channels).getAllByRole('checkbox')

    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'false',
    ])
    expect(within(channels).getAllByText('Plugin update needed')).toHaveLength(
      1
    )
  })

  it('creates metadata for a model that has none from its description alone', async () => {
    const user = userEvent.setup()
    const { post } = mockApi()
    post.mockResolvedValue({ data: { success: true, data: { id: 9 } } })
    renderSection()

    await user.click(await screen.findByRole('button', { name: /gpt-new/ }))
    const save = screen.getByRole('button', { name: 'Save metadata' })
    expect(save).toBeDisabled()
    expect(screen.getByText('Vendor')).toBeVisible()
    expect(screen.getByText('Tags')).toBeVisible()

    await user.type(screen.getByLabelText('Description'), 'Fast model')
    await user.click(save)

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/models/',
        expect.objectContaining({
          model_name: 'gpt-new',
          description: '<!-- lang:zh -->\nFast model',
          name_rule: 0,
        }),
        expect.anything()
      )
    )
  })

  it('starts a model without metadata from its draft and lists what blocks going live', async () => {
    const user = userEvent.setup()
    const [draftModel, ...others] = overview.items
    mockApi(upstreamReport, {
      ...overview,
      items: [
        {
          ...draftModel,
          draft: {
            description: '<!-- lang:zh -->\n草稿说明',
            icon: 'Doubao.Color',
            tags: 'video',
            based_on: 'gpt-done',
            polished: true,
            generated_at: 1,
          },
        },
        ...others,
      ],
    })
    renderSection()

    await user.click(await screen.findByRole('button', { name: /gpt-new/ }))

    expect(screen.getByLabelText('Description')).toHaveValue('草稿说明')
    expect(screen.getByRole('button', { name: 'Save metadata' })).toBeEnabled()
    expect(
      screen.getByText(/Filled from a draft written by the description writer/)
    ).toBeVisible()
    expect(
      screen.getByText(/Icon, tags and vendor follow gpt-done/)
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Confirm and go live' })
    ).toBeDisabled()
    expect(screen.getByText(/Pick a category/)).toBeVisible()
  })

  it('overwrites the description with the supplier text when fetched', async () => {
    const user = userEvent.setup()
    const [draftModel, ...others] = overview.items
    const { post } = mockApi(upstreamReport, {
      ...overview,
      items: [
        {
          ...draftModel,
          draft: { description: '<!-- lang:zh -->\n草稿说明', generated_at: 1 },
        },
        ...others,
      ],
    })
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          description: '上游参数说明',
          channel_name: 'alpha',
          prices_removed: true,
        },
      },
    })
    renderSection()

    await user.click(await screen.findByRole('button', { name: /gpt-new/ }))
    await user.click(
      screen.getByRole('button', { name: 'Fetch supplier description' })
    )

    expect(post).toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/description',
      { model_name: 'gpt-new' }
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Description')).toHaveValue('上游参数说明')
    )
    expect(screen.getByRole('button', { name: 'Save metadata' })).toBeEnabled()
  })

  it('keeps the description when the supplier has none', async () => {
    const user = userEvent.setup()
    const [draftModel, ...others] = overview.items
    const { post } = mockApi(upstreamReport, {
      ...overview,
      items: [
        {
          ...draftModel,
          draft: { description: '<!-- lang:zh -->\n草稿说明', generated_at: 1 },
        },
        ...others,
      ],
    })
    post.mockResolvedValue({
      data: { success: true, data: { description: '' } },
    })
    renderSection()

    await user.click(await screen.findByRole('button', { name: /gpt-new/ }))
    await user.click(
      screen.getByRole('button', { name: 'Fetch supplier description' })
    )

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(screen.getByLabelText('Description')).toHaveValue('草稿说明')
  })

  it('shows a configured, priced model as on sale', async () => {
    signInAsRoot()
    const user = userEvent.setup()
    mockApi({ ...upstreamReport, changes: [] })
    renderSection()

    await user.click(await screen.findByRole('tab', { name: /All/ }))
    await user.click(await screen.findByRole('button', { name: /gpt-done/ }))

    expect(await screen.findByText('This model is on sale.')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Confirm and go live' })
    ).toBeDisabled()
  })

  it('confirms the upstream price only after fetching it and listing both prices', async () => {
    signInAsRoot()
    const user = userEvent.setup()
    const { post } = mockApi()
    post.mockResolvedValue({ data: { success: true, data: upstreamReport } })
    renderSection()

    await user.click(
      await screen.findByRole('tab', { name: /Upstream repriced \(1\)/ })
    )
    await user.click(screen.getByRole('button', { name: /gpt-done/ }))
    await screen.findByText('Upstream price of alpha changed')
    expect(
      screen.queryByRole('button', { name: 'Confirm upstream price' })
    ).toBeNull()
    expect(screen.queryByText('Latest upstream price')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Fetch latest price' }))

    expect(post).toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/check'
    )
    expect(await screen.findByText('Latest upstream price')).toBeVisible()
    expect(screen.getByText('Current price')).toBeVisible()
    expect(post).not.toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/apply',
      expect.anything()
    )

    await user.click(
      screen.getByRole('button', { name: 'Confirm upstream price' })
    )

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/models/onboarding/upstream_prices/apply',
        { model_name: 'gpt-done' }
      )
    )
  })

  it('keeps confirmation locked when the supplier fetch fails', async () => {
    signInAsRoot()
    const user = userEvent.setup()
    const { post } = mockApi()
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...upstreamReport,
          channels: upstreamReport.channels.map((channel) => ({
            ...channel,
            status: 'error',
            error: 'pricing request returned HTTP 500',
          })),
        },
      },
    })
    renderSection()

    await user.click(
      await screen.findByRole('tab', { name: /Upstream repriced \(1\)/ })
    )
    await user.click(screen.getByRole('button', { name: /gpt-done/ }))
    await user.click(
      await screen.findByRole('button', { name: 'Fetch latest price' })
    )

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/models/onboarding/upstream_prices/check'
      )
    )
    expect(
      await screen.findByRole('button', { name: 'Fetch latest price' })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Confirm upstream price' })
    ).toBeNull()
    expect(screen.queryByText('Latest upstream price')).toBeNull()
  })

  it('marks a supplier price change handled on every channel without copying it', async () => {
    signInAsRoot()
    const user = userEvent.setup()
    const { post } = mockApi()
    post.mockResolvedValue({
      data: { success: true, data: { ...upstreamReport, changes: [] } },
    })
    renderSection()

    await user.click(
      await screen.findByRole('tab', { name: /Upstream repriced \(1\)/ })
    )
    await user.click(screen.getByRole('button', { name: /gpt-done/ }))
    const pricing = (
      await screen.findByText('Upstream price of alpha changed')
    ).closest('section, div') as HTMLElement
    await user.click(
      within(pricing.parentElement as HTMLElement).getByRole('button', {
        name: 'Mark handled',
      })
    )

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/models/onboarding/upstream_prices/acknowledge',
        { model_names: ['gpt-done'] }
      )
    )
    expect(post).not.toHaveBeenCalledWith(
      '/api/models/onboarding/upstream_prices/apply',
      expect.anything()
    )
  })

  it('shows a served model price read-only without the channel card once it matches upstream', async () => {
    signInAsRoot()
    const user = userEvent.setup()
    mockApi({
      ...upstreamReport,
      models: {
        'gpt-done': { ...upstreamReport.models['gpt-done'], in_sync: true },
      },
    })
    renderSection()

    await user.click(await screen.findByRole('tab', { name: /All/ }))
    await user.click(screen.getByRole('button', { name: /gpt-done/ }))

    expect(
      await screen.findByText('Upstream price of alpha unchanged')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Fetch latest price' })
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Save model prices' })
    ).toBeNull()
    expect(screen.queryByText('Channels and groups')).toBeNull()
  })

  it('takes supplier tokens in masked text fields that browsers do not fill with saved passwords', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'administrator', role: 100 })
    const user = userEvent.setup()
    const { put } = mockApi()
    renderSection()

    await user.click(
      await screen.findByRole('button', { name: 'Supplier tokens' })
    )
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByRole('textbox', {
      name: 'Supplier token for alpha',
    })

    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(dialog.querySelector('input[type=password]')).toBeNull()

    await user.type(field, 'sk-supplier')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/api/models/onboarding/upstream_prices/token',
        { channel_id: 1, token: 'sk-supplier' }
      )
    )
  })
})
