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
import { AlertCircle, Music, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { StudioAsset } from '../types'
import { Button } from '@/components/ui/button'

interface AssetThumbProps {
  asset: StudioAsset
  /** Badge text, such as the mention "@图片1" or "First frame". */
  label: string
  onRemove: () => void
}

/** Square preview of a reference file with its label and a remove button. */
export function AssetThumb(props: AssetThumbProps) {
  const { t } = useTranslation()
  const asset = props.asset
  const failed = asset.status === 'error'

  let preview = (
    <span className='bg-muted text-muted-foreground flex size-full items-center justify-center'>
      <Music className='size-5' aria-hidden />
    </span>
  )
  if (asset.kind === 'image') {
    preview = (
      <img src={asset.previewUrl} alt='' className='size-full object-cover' />
    )
  } else if (asset.kind === 'video') {
    preview = (
      <video
        src={asset.previewUrl}
        muted
        playsInline
        preload='metadata'
        className='size-full object-cover'
      />
    )
  }

  const tile = (
    <div
      className={cn(
        'group/thumb relative size-16 shrink-0 overflow-hidden rounded-lg border',
        failed && 'border-destructive'
      )}
      title={asset.fileName}
    >
      {preview}
      <span className='absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-center text-micro font-medium text-white'>
        {failed ? t('Upload failed') : props.label}
      </span>
      {asset.status === 'uploading' && (
        <span className='absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white'>
          {asset.progress}%
        </span>
      )}
      {failed && (
        <span className='bg-destructive/20 text-destructive absolute inset-0 flex items-center justify-center'>
          <AlertCircle className='size-5' aria-hidden />
        </span>
      )}
      <Button variant='plain' size='inline'
        type='button'
        onClick={props.onRemove}
        aria-label={t('Remove {{name}}', { name: asset.fileName })}
        className='absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition-opacity hover:bg-black sm:opacity-0 sm:group-hover/thumb:opacity-100 sm:focus-visible:opacity-100'
      >
        <X className='size-3' aria-hidden />
      </Button>
    </div>
  )

  if (!failed || !asset.error) return tile
  return (
    <Tooltip>
      <TooltipTrigger render={tile} />
      <TooltipContent>{asset.error}</TooltipContent>
    </Tooltip>
  )
}
