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
import { render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EN_DOCS } from '../content/en'
import { ZH_DOCS } from '../content/zh'
import { Docs } from '../index'

vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: ReactNode }) => (
    <main>{props.children}</main>
  ),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { server_address: 'https://api.example.com/' } }),
}))

afterEach(async () => {
  await i18next.changeLanguage('en')
})

describe('Docs', () => {
  it('keeps the same section anchors in every language', () => {
    expect(ZH_DOCS.sections.map((section) => section.id)).toEqual(
      EN_DOCS.sections.map((section) => section.id)
    )
  })

  it.each([
    ['English', EN_DOCS],
    ['Chinese', ZH_DOCS],
  ])('keeps NSFW models out of the %s docs', (_language, docs) => {
    expect(JSON.stringify(docs)).not.toMatch(/nsfw|720p-P/i)
  })

  it('shows the English docs with the site address for non-Chinese interfaces', () => {
    render(<Docs />)

    expect(
      screen.getByRole('heading', { level: 1, name: EN_DOCS.title })
    ).toBeInTheDocument()
    expect(document.body.textContent).toContain(
      'curl https://api.example.com/v1/videos'
    )
    expect(document.body.textContent).not.toContain('{{BASE_URL}}')
  })

  it.each([
    ['en', EN_DOCS],
    ['zhCN', ZH_DOCS],
  ])(
    'shows the multi-connection download command for %s in the download section',
    async (language, docs) => {
      await i18next.changeLanguage(language)
      render(<Docs />)

      const downloadTitle = docs.sections.find(
        (section) => section.id === 'download'
      )?.title
      const download = screen.getByRole('region', { name: downloadTitle })
      expect(download.textContent).toContain('Range')
      expect(download.textContent).toContain('aria2c -x 8 -s 8')
      expect(download.textContent).toContain(
        '"https://api.example.com/v1/videos/$TASK_ID/content"'
      )
    }
  )

  it.each([
    ['en', EN_DOCS],
    ['zhCN', ZH_DOCS],
  ])(
    'shows the image generation request for %s in the images section',
    async (language, docs) => {
      await i18next.changeLanguage(language)
      render(<Docs />)

      const imagesTitle = docs.sections.find(
        (section) => section.id === 'images'
      )?.title
      const images = screen.getByRole('region', { name: imagesTitle })
      expect(images.textContent).toContain(
        'curl https://api.example.com/v1/images/generations'
      )
      expect(images.textContent).toContain('"response_format": "b64_json"')
    }
  )

  it.each(['zhCN', 'zhTW'])(
    'shows the Chinese docs for %s',
    async (language) => {
      await i18next.changeLanguage(language)
      render(<Docs />)

      expect(
        screen.getByRole('heading', { level: 1, name: ZH_DOCS.title })
      ).toBeInTheDocument()
    }
  )

  it('links the table of contents to every section', () => {
    render(<Docs />)

    const toc = screen.getByRole('navigation', { name: 'On this page' })
    for (const section of EN_DOCS.sections) {
      expect(
        within(toc).getByRole('link', { name: section.title })
      ).toHaveAttribute('href', `#${section.id}`)
      expect(
        screen.getByRole('region', { name: section.title })
      ).toHaveAttribute('id', section.id)
    }
  })
})
