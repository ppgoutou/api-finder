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

const PART_SIZE = 2 * 1024 * 1024
// The gateway allows 16 concurrent requests per task artifact and the page's
// own player also uses some, so this stays well under that limit.
const MAX_CONNECTIONS = 6
const PART_ATTEMPTS = 3
const RETRY_DELAY_MS = 500
// Parts are held in the browser until the file is complete.
const MAX_SEGMENTED_BYTES = 2 * 1024 * 1024 * 1024

interface FirstPart {
  bytes: ArrayBuffer
  total: number
  etag: string | null
  type: string
}

function partTotal(response: Response, start: number, end: number) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
    response.headers.get('Content-Range') ?? ''
  )
  if (!match || Number(match[1]) !== start) return null
  const total = Number(match[3])
  if (Number(match[2]) !== Math.min(end, total - 1)) return null
  return total
}

async function waitBeforeRetry(attempt: number, signal: AbortSignal) {
  await new Promise((resolve) => {
    setTimeout(resolve, RETRY_DELAY_MS * attempt)
  })
  signal.throwIfAborted()
}

async function fetchFirstPart(
  url: string,
  signal: AbortSignal
): Promise<FirstPart> {
  const response = await fetch(url, {
    credentials: 'omit',
    headers: { Range: `bytes=0-${PART_SIZE - 1}` },
    signal,
  })
  const total =
    response.status === 206 ? partTotal(response, 0, PART_SIZE - 1) : null
  if (total === null || total > MAX_SEGMENTED_BYTES) {
    await response.body?.cancel()
    throw new Error('The server did not answer with a usable range')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== Math.min(PART_SIZE, total)) {
    throw new Error('The first part has an unexpected length')
  }
  return {
    bytes,
    total,
    etag: response.headers.get('ETag'),
    type: response.headers.get('Content-Type') ?? '',
  }
}

async function fetchPart(
  url: string,
  first: FirstPart,
  start: number,
  signal: AbortSignal
) {
  const end = Math.min(start + PART_SIZE, first.total) - 1
  let lastError: unknown
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    if (attempt > 1) await waitBeforeRetry(attempt - 1, signal)
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      })
      if (response.status !== 206) {
        await response.body?.cancel()
        throw new Error(`Part answered with status ${response.status}`)
      }
      // A different total or ETag means the parts would not join into one
      // file, and trying the same part again cannot fix that.
      if (
        partTotal(response, start, end) !== first.total ||
        response.headers.get('ETag') !== first.etag
      ) {
        await response.body?.cancel()
        throw new DOMException('The file changed', 'InvalidStateError')
      }
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength !== end - start + 1) {
        throw new Error('The part has an unexpected length')
      }
      return bytes
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof DOMException && error.name === 'InvalidStateError')
      ) {
        throw error
      }
      lastError = error
    }
  }
  throw lastError
}

/**
 * Downloads a file over several Range requests at once and joins the parts.
 * Rejects when the server cannot serve usable ranges, so callers can fall back
 * to an ordinary download.
 */
export async function downloadInParts(
  url: string,
  options: { signal: AbortSignal; onProgress: (percent: number) => void }
): Promise<Blob> {
  const parts = new AbortController()
  const stopParts = () => parts.abort()
  options.signal.addEventListener('abort', stopParts)
  try {
    const first = await fetchFirstPart(url, parts.signal)
    const partCount = Math.ceil(first.total / PART_SIZE)
    const chunks: ArrayBuffer[] = []
    chunks[0] = first.bytes
    let received = first.bytes.byteLength
    let nextPart = 1
    options.onProgress(Math.floor((received / first.total) * 100))

    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONNECTIONS, partCount - 1) },
        async () => {
          while (nextPart < partCount) {
            const part = nextPart++
            const bytes = await fetchPart(
              url,
              first,
              part * PART_SIZE,
              parts.signal
            )
            chunks[part] = bytes
            received += bytes.byteLength
            options.onProgress(Math.floor((received / first.total) * 100))
          }
        }
      )
    ).catch((error: unknown) => {
      parts.abort()
      throw error
    })
    return new Blob(chunks, { type: first.type })
  } finally {
    options.signal.removeEventListener('abort', stopParts)
  }
}
