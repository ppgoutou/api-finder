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
import { afterEach, describe, expect, it } from 'vitest'

import { createSiteTitle } from '@/lib/site-title'

function renderHead(title: string, canonical: boolean) {
  const link = canonical
    ? '<link rel="canonical" href="https://example.com/pricing" />'
    : ''
  document.head.innerHTML = `<title>${title}</title><meta name="title" content="${title}" />${link}`
}

function metaTitle(): string | null {
  return (
    document.querySelector('meta[name="title"]')?.getAttribute('content') ??
    null
  )
}

afterEach(() => {
  document.head.innerHTML = ''
})

describe('createSiteTitle', () => {
  it('keeps the server title on the page the server rendered', () => {
    renderHead('Pricing | Acme', true)
    const siteTitle = createSiteTitle(document, '/pricing')

    siteTitle.setSiteName('Acme')

    expect(document.title).toBe('Pricing | Acme')
    expect(metaTitle()).toBe('Pricing | Acme')
  })

  it('shows the site name after navigating away and the server title again on return', () => {
    renderHead('Pricing | Acme', true)
    const siteTitle = createSiteTitle(document, '/pricing')
    siteTitle.setSiteName('Acme')

    siteTitle.setPath('/dashboard')
    expect(document.title).toBe('Acme')
    expect(metaTitle()).toBe('Acme')

    siteTitle.setPath('/pricing')
    expect(document.title).toBe('Pricing | Acme')
  })

  it('shows the site name on pages the server did not title', () => {
    renderHead('Default', false)
    const siteTitle = createSiteTitle(document, '/dashboard')

    siteTitle.setSiteName('Acme')

    expect(document.title).toBe('Acme')
  })

  it('leaves the title alone until the site name is known', () => {
    renderHead('Default', false)
    const siteTitle = createSiteTitle(document, '/dashboard')

    siteTitle.setPath('/keys')

    expect(document.title).toBe('Default')
  })

  it('treats a trailing slash as the same page', () => {
    renderHead('Model | Acme', true)
    const siteTitle = createSiteTitle(document, '/pricing/model-a/')
    siteTitle.setSiteName('Acme')

    siteTitle.setPath('/pricing/model-a')

    expect(document.title).toBe('Model | Acme')
  })
})
