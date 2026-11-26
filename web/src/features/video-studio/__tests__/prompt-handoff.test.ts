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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handoffFromPrompt } from '../lib/prompt-handoff'

afterEach(() => {
  window.sessionStorage.clear()
  vi.resetModules()
})

describe('handoffFromPrompt', () => {
  it('carries a shown prompt and the settings of its spec line', () => {
    expect(
      handoffFromPrompt('a fox in snow', 'seedance 2.0 · 16:9 · 720p · 5s')
    ).toMatchObject({
      kind: 'video',
      draft: {
        prompt: 'a fox in snow',
        mode: 'text',
        references: [],
        ratio: '16:9',
        seconds: 5,
      },
    })
  })

  it('leaves settings to the page when there is no spec line', () => {
    const { draft } = handoffFromPrompt('a fox in snow')
    expect(draft).toEqual({
      prompt: 'a fox in snow',
      mode: 'text',
      references: [],
    })
  })
})

describe('studio handoff store', () => {
  it('keeps the work for the tab so it survives signing up', async () => {
    const first = await import('@/stores/studio-handoff-store')
    first.useStudioHandoff.getState().set(handoffFromPrompt('a fox in snow'))

    vi.resetModules()
    const reloaded = await import('@/stores/studio-handoff-store')
    expect(reloaded.useStudioHandoff.getState().handoff?.draft.prompt).toBe(
      'a fox in snow'
    )

    reloaded.useStudioHandoff.getState().set(null)
    expect(window.sessionStorage.getItem('video-studio:handoff')).toBeNull()
  })

  it('ignores a stored value that is not a work', async () => {
    window.sessionStorage.setItem('video-studio:handoff', '{"kind":"evil"}')
    const store = await import('@/stores/studio-handoff-store')
    expect(store.useStudioHandoff.getState().handoff).toBeNull()
  })
})
