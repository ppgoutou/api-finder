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

/** Longest edge of a cover: sharp on the largest gallery card at 2x. */
const COVER_MAX_EDGE = 960
const COVER_QUALITY = 0.8
/** Later than the first frame, which is often black or a fade-in. */
const COVER_TIME_SECONDS = 1

/**
 * A small cover image of a video file, taken from a frame near its start, or
 * null when the browser cannot decode the video. WebP where the browser can
 * encode it, JPEG otherwise.
 */
export async function captureVideoCover(video: Blob): Promise<File | null> {
  const url = URL.createObjectURL(video)
  const element = document.createElement('video')
  element.muted = true
  element.playsInline = true
  element.preload = 'auto'

  const reached = (event: string) =>
    new Promise<void>((resolve, reject) => {
      element.addEventListener(event, () => resolve(), { once: true })
      element.addEventListener('error', () => reject(element.error), {
        once: true,
      })
    })

  try {
    const metadata = reached('loadedmetadata')
    element.src = url
    await metadata
    const seeked = reached('seeked')
    element.currentTime = Math.min(COVER_TIME_SECONDS, element.duration / 2)
    await seeked

    const scale = Math.min(
      1,
      COVER_MAX_EDGE / Math.max(element.videoWidth, element.videoHeight)
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(element.videoWidth * scale)
    canvas.height = Math.round(element.videoHeight * scale)
    canvas
      .getContext('2d')
      ?.drawImage(element, 0, 0, canvas.width, canvas.height)

    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, COVER_QUALITY)
      )
    // Browsers that cannot encode WebP hand back a PNG instead.
    const webp = await encode('image/webp')
    if (webp?.type === 'image/webp') {
      return new File([webp], 'cover.webp', { type: webp.type })
    }
    const jpeg = await encode('image/jpeg')
    return jpeg && new File([jpeg], 'cover.jpg', { type: jpeg.type })
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
