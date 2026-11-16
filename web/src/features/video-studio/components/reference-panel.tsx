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
import { ImagePlus, Plus } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ASSET_ACCEPT } from '../constants'
import { labelReferences } from '../lib/draft'
import { localizeMentions } from '../lib/mention-names'
import type { StudioAsset } from '../types'
import { AssetThumb } from './asset-thumb'

interface AddTileProps {
  label: string
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
}

/** Dashed tile that opens the file picker. */
function AddTile(props: AddTileProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type='button'
        onClick={() => inputRef.current?.click()}
        className='border-border text-muted-foreground hover:border-primary hover:text-primary flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[11px] transition-colors'
      >
        {props.multiple ? (
          <Plus className='size-4' aria-hidden />
        ) : (
          <ImagePlus className='size-4' aria-hidden />
        )}
        {props.label}
      </button>
      <input
        ref={inputRef}
        type='file'
        hidden
        accept={props.accept}
        multiple={props.multiple}
        aria-label={props.label}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length) props.onFiles(files)
        }}
      />
    </>
  )
}

interface ReferencePanelProps {
  references: StudioAsset[]
  onAddFiles: (files: File[]) => void
  onRemove: (asset: StudioAsset) => void
  /** File types the picker offers; images, videos and audio by default. */
  accept?: string
}

/** Reference mode: images, videos and audio, each labeled with its token. */
export function ReferencePanel(props: ReferencePanelProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const accept = props.accept ?? Object.values(ASSET_ACCEPT).join(',')
  return (
    <div className='flex gap-2 overflow-x-auto pb-1'>
      <AddTile
        label={t('References')}
        accept={accept}
        multiple
        onFiles={props.onAddFiles}
      />
      {labelReferences(props.references).map(({ asset, token }) => (
        <AssetThumb
          key={asset.id}
          asset={asset}
          label={localizeMentions(`@${token}`, language)}
          onRemove={() => props.onRemove(asset)}
        />
      ))}
    </div>
  )
}

interface FramePanelProps {
  firstFrame?: StudioAsset
  lastFrame?: StudioAsset
  onSetFrame: (slot: 'first' | 'last', file: File) => void
  onRemoveFrame: (slot: 'first' | 'last') => void
}

/** Frames mode: a first frame and an optional last frame. */
export function FramePanel(props: FramePanelProps) {
  const { t } = useTranslation()
  const slots = [
    {
      slot: 'first' as const,
      label: t('First frame'),
      asset: props.firstFrame,
    },
    { slot: 'last' as const, label: t('Last frame'), asset: props.lastFrame },
  ]
  return (
    <div className='flex gap-2'>
      {slots.map((entry) =>
        entry.asset ? (
          <AssetThumb
            key={entry.slot}
            asset={entry.asset}
            label={entry.label}
            onRemove={() => props.onRemoveFrame(entry.slot)}
          />
        ) : (
          <AddTile
            key={entry.slot}
            label={entry.label}
            accept={ASSET_ACCEPT.image}
            onFiles={(files) => props.onSetFrame(entry.slot, files[0])}
          />
        )
      )}
    </div>
  )
}
