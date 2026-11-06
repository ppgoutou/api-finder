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
import { type MouseEvent, useEffect, useRef, useState } from 'react'

import { downloadInParts } from '@/lib/segmented-download'

const OBJECT_URL_LIFETIME_MS = 60_000
const EXTENSION_BY_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

function clickLink(attributes: Partial<HTMLAnchorElement>) {
  const link = document.createElement('a')
  Object.assign(link, attributes)
  document.body.append(link)
  link.click()
  link.remove()
}

function namedForType(filename: string, type: string) {
  if (filename.includes('.')) return filename
  const extension = EXTENSION_BY_TYPE[type.split(';')[0].trim().toLowerCase()]
  return extension ? `${filename}.${extension}` : filename
}

/**
 * Click handler for a download link: a plain click downloads in parts, and any
 * failure falls back to the link itself. Modified clicks stay with the browser,
 * and leaving the page cancels a running download. `percent` is null when idle.
 */
export function useSegmentedDownload(url: string, filename: string) {
  const [percent, setPercent] = useState<number | null>(null)
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [])

  async function start() {
    const controller = new AbortController()
    running.current = controller
    setPercent(0)
    try {
      const blob = await downloadInParts(url, {
        signal: controller.signal,
        onProgress: setPercent,
      })
      const objectUrl = URL.createObjectURL(blob)
      clickLink({
        href: objectUrl,
        download: namedForType(filename, blob.type),
      })
      setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_LIFETIME_MS)
    } catch {
      // A new tab keeps this page open when the browser shows the file instead
      // of saving it.
      if (!controller.signal.aborted) {
        clickLink({
          href: url,
          download: filename,
          target: '_blank',
          rel: 'noopener noreferrer',
        })
      }
    } finally {
      running.current = null
      setPercent(null)
    }
  }

  function onClick(event: MouseEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (!running.current) void start()
  }

  return { percent, onClick }
}
