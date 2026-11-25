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
export type SiteTitle = {
  /** Sets the site name shown on pages the server did not title. */
  setSiteName: (name: string) => void
  /** Tells the title which path the app now shows. */
  setPath: (path: string) => void
  /** Sets a note shown in front of the title, or clears it with ''. */
  setNote: (note: string) => void
}

let current: SiteTitle | undefined

/** Sets the note on the page's title, such as how many works are running. */
export function setSiteTitleNote(note: string) {
  current?.setNote(note)
}

/**
 * Keeps the document title in step with the page. The server writes a
 * page-specific title, marked by a canonical link, into public pages so
 * search engines index them by topic; the app keeps that title while it shows
 * the page the server rendered, and uses the site name everywhere else.
 * Replacing the server title would make crawlers that run scripts index every
 * page under the site name alone.
 */
export function createSiteTitle(doc: Document, initialPath: string): SiteTitle {
  const hasServerTitle = doc.querySelector('link[rel="canonical"]') !== null
  const serverTitle = doc.title
  let siteName = ''
  let note = ''
  // The router may drop a trailing slash the address bar had.
  const serverPath = initialPath.replace(/\/+$/, '')
  let path = initialPath

  const render = () => {
    const title =
      hasServerTitle && path.replace(/\/+$/, '') === serverPath
        ? serverTitle
        : siteName
    if (!title) return
    doc.title = note ? `${note} · ${title}` : title
    doc.querySelector('meta[name="title"]')?.setAttribute('content', title)
  }

  const siteTitle: SiteTitle = {
    setSiteName: (name) => {
      siteName = name
      render()
    },
    setPath: (nextPath) => {
      path = nextPath
      render()
    },
    setNote: (nextNote) => {
      note = nextNote
      render()
    },
  }
  current = siteTitle
  return siteTitle
}
