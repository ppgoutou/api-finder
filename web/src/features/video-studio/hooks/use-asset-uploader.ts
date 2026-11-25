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
import { useTranslation } from 'react-i18next'

import {
  getServerErrorMessage,
  getServerMessage,
} from '@/lib/server-error-message'

import { uploadVideoAsset } from '../api'
import { ASSET_MAX_BYTES } from '../constants'
import type { AssetKind, StudioAsset } from '../types'

export function assetKindOf(file: File): AssetKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return null
}

let nextAssetId = 0

/**
 * Starts uploading a file and reports every state change of its asset
 * through `onChange`, beginning with the uploading placeholder.
 */
export function useAssetUploader() {
  const { t } = useTranslation()

  return (
    file: File,
    kind: AssetKind,
    onChange: (asset: StudioAsset) => void
  ): StudioAsset => {
    nextAssetId += 1
    const base: StudioAsset = {
      id: `asset-${nextAssetId}`,
      kind,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading',
      progress: 0,
    }
    if (file.size > ASSET_MAX_BYTES[kind]) {
      const failed: StudioAsset = {
        ...base,
        status: 'error',
        error: t(
          '{{name}} is {{size}} MB. Images can be up to 10 MB, videos up to 50 MB and audio up to 15 MB.',
          { name: file.name, size: Math.ceil(file.size / (1024 * 1024)) }
        ),
      }
      onChange(failed)
      return failed
    }
    const start = () => {
      onChange(base)
      uploadVideoAsset(file, (progress) => onChange({ ...base, progress }))
        .then((response) => {
          if (response.success && response.data?.url) {
            onChange({
              ...base,
              status: 'ready',
              progress: 100,
              url: response.data.url,
              uploadedAt: Math.floor(Date.now() / 1000),
            })
            return
          }
          onChange({
            ...base,
            status: 'error',
            error: getServerMessage(response) || t('Upload failed'),
            retry: start,
          })
        })
        .catch((error: unknown) => {
          onChange({
            ...base,
            status: 'error',
            error: getServerErrorMessage(error, t('Upload failed')),
            retry: start,
          })
        })
    }
    start()
    return base
  }
}
