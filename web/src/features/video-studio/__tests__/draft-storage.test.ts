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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_DRAFT } from '../constants'
import {
  markDraftSubmitted,
  readDraft,
  saveDraft,
  wouldLoseDraft,
} from '../lib/draft-storage'
import type { StudioAsset } from '../types'

const NOW = 1_790_000_000
const DAY = 24 * 60 * 60

function image(name: string, uploadedAt: number): StudioAsset {
  return {
    id: name,
    kind: 'image',
    fileName: name,
    previewUrl: 'blob:preview',
    status: 'ready',
    progress: 100,
    url: `https://site.example/${name}`,
    uploadedAt,
  }
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('studio draft storage', () => {
  it('keeps the drafts of accounts sharing a browser apart', () => {
    saveDraft('video', 1, { ...DEFAULT_DRAFT, prompt: 'mine' })

    expect(readDraft('video', 2, NOW)).toBeNull()
    expect(readDraft('image', 1, NOW)).toBeNull()
    expect(readDraft('video', 1, NOW)?.draft.prompt).toBe('mine')
  })

  it('drops files the server has deleted and renumbers the mentions left', () => {
    saveDraft('video', 1, {
      ...DEFAULT_DRAFT,
      prompt: '@图片1 and @图片2',
      references: [image('old.png', NOW - 8 * DAY), image('new.png', NOW)],
    })

    const draft = readDraft('video', 1, NOW)?.draft
    expect(draft?.references.map((asset) => asset.fileName)).toEqual([
      'new.png',
    ])
    expect(draft?.prompt).toBe(' and @图片1')
  })

  it('leaves out files that were not uploaded', () => {
    saveDraft('video', 1, {
      ...DEFAULT_DRAFT,
      references: [
        { ...image('a.png', NOW), status: 'uploading', url: undefined },
      ],
    })

    expect(readDraft('video', 1, NOW)?.draft.references).toEqual([])
  })

  it('ignores a stored draft it cannot read', () => {
    window.localStorage.setItem('video-studio:draft:video:1', '{"prompt":1}')

    expect(readDraft('video', 1, NOW)).toBeNull()
  })

  it('warns about losing a prompt only while it was never submitted', () => {
    expect(wouldLoseDraft('video', 1, 'other')).toBe(false)
    saveDraft('video', 1, { ...DEFAULT_DRAFT, prompt: 'a cat' })

    expect(wouldLoseDraft('video', 1, 'other')).toBe(true)
    expect(wouldLoseDraft('video', 1, 'a cat ')).toBe(false)
    markDraftSubmitted('video', 1, 'a cat')
    expect(wouldLoseDraft('video', 1, 'other')).toBe(false)
    saveDraft('video', 1, { ...DEFAULT_DRAFT, prompt: 'a cat and a dog' })
    expect(wouldLoseDraft('video', 1, 'other')).toBe(true)
  })
})
