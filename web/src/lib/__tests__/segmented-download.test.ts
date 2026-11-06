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

import { downloadInParts } from '../segmented-download'

const MIB = 1024 * 1024
const URL_A = 'https://site.example/v1/tasks/task_1/artifacts/video/content'

function fileOf(size: number) {
  const file = new Uint8Array(size)
  for (let index = 0; index < size; index++) file[index] = index % 251
  return file
}

function readBlob(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () =>
      resolve(new Uint8Array(reader.result as ArrayBuffer))
    )
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsArrayBuffer(blob)
  })
}

function rangedResponse(file: Uint8Array, request: RequestInit, etag = '"a"') {
  const range = new Headers(request.headers).get('Range') ?? ''
  const match = /^bytes=(\d+)-(\d+)$/.exec(range)
  const start = Number(match?.[1])
  const end = Math.min(Number(match?.[2]), file.length - 1)
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${file.length}`,
      'Content-Type': 'video/mp4',
      ETag: etag,
    },
  })
}

function stubRangedFetch(file: Uint8Array) {
  const fetchMock = vi.fn(async (_url: string, request: RequestInit) =>
    rangedResponse(file, request)
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function download(onProgress: (percent: number) => void = () => undefined) {
  return downloadInParts(URL_A, {
    signal: new AbortController().signal,
    onProgress,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('downloadInParts', () => {
  it('joins a multi-part file byte for byte and reports reaching 100 percent', async () => {
    const file = fileOf(10 * MIB + 7)
    const fetchMock = stubRangedFetch(file)
    const onProgress = vi.fn()

    const blob = await download(onProgress)

    expect(Buffer.compare(await readBlob(blob), file)).toBe(0)
    expect(blob.type).toBe('video/mp4')
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it('makes one request for a file smaller than a part', async () => {
    const fetchMock = stubRangedFetch(fileOf(1024))

    const blob = await download()

    expect(blob.size).toBe(1024)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('never runs more than six part requests at once', async () => {
    const file = fileOf(40 * MIB)
    let active = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, request: RequestInit) => {
        active++
        peak = Math.max(peak, active)
        await Promise.resolve()
        await Promise.resolve()
        active--
        return rangedResponse(file, request)
      })
    )

    await download()

    expect(peak).toBe(6)
  })

  it('rejects when the server ignores the range and answers with the whole file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fileOf(1024), { status: 200 }))
    )

    await expect(download()).rejects.toThrow('usable range')
  })

  it('rejects when Content-Range is not readable, as on a cross-origin response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fileOf(1024), { status: 206 }))
    )

    await expect(download()).rejects.toThrow('usable range')
  })

  it('tries a failed part again and still returns the complete file', async () => {
    const file = fileOf(6 * MIB)
    let failures = 1
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const range = new Headers(request.headers).get('Range') ?? ''
      if (!range.startsWith('bytes=0-') && failures > 0) {
        failures--
        return new Response('busy', { status: 429 })
      }
      return rangedResponse(file, request)
    })
    vi.stubGlobal('fetch', fetchMock)

    const blob = await download()

    expect(Buffer.compare(await readBlob(blob), file)).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('rejects without retrying when a later part belongs to a different file version', async () => {
    const file = fileOf(3 * MIB)
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const range = new Headers(request.headers).get('Range') ?? ''
      return rangedResponse(
        file,
        request,
        range.startsWith('bytes=0-') ? '"a"' : '"b"'
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(download()).rejects.toThrow('The file changed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
