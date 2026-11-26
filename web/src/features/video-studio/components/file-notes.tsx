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

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { countReferences } from '../lib/draft'
import type { AssetKind, StudioAsset } from '../types'

interface ReferenceUsageProps {
  references: StudioAsset[]
  limits: Readonly<Record<AssetKind, number>>
  onRemoveExtra: () => void
  /** A model that takes all the files, when the picked one does not. */
  switchTo?: { label: string; onSwitch: () => void }
}

/** How many reference files the model takes and how many are added. */
export function ReferenceUsage(props: ReferenceUsageProps) {
  const { t } = useTranslation()
  const used = countReferences(props.references)
  const kinds: { kind: AssetKind; label: string }[] = [
    { kind: 'image', label: t('Image') },
    { kind: 'video', label: t('Video') },
    { kind: 'audio', label: t('Audio') },
  ]
  const over = kinds.some(({ kind }) => used[kind] > props.limits[kind])

  return (
    <span className='inline-flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums'>
      {kinds.map(({ kind, label }) => (
        <span
          key={kind}
          className={cn(
            used[kind] > props.limits[kind] && 'text-destructive font-medium'
          )}
        >
          {label} {used[kind]}/{props.limits[kind]}
        </span>
      ))}
      {over ? (
        <Button
          type='button'
          variant='link'
          size='inline'
          className='text-destructive font-medium'
          onClick={props.onRemoveExtra}
        >
          {t('Remove the extra files')}
        </Button>
      ) : null}
      {over && props.switchTo && (
        <Button
          type='button'
          variant='link'
          size='inline'
          className='font-medium'
          onClick={props.switchTo.onSwitch}
        >
          {t('Switch to {{model}}', { model: props.switchTo.label })}
        </Button>
      )}
      {!over && (
        <span className='max-md:hidden'>{t('Drop or paste to upload')}</span>
      )}
    </span>
  )
}

/** Why files could not be uploaded, spelled out instead of on hover. */
export function FileProblems(props: { assets: readonly StudioAsset[] }) {
  const problems = [
    ...new Set(
      props.assets.flatMap((asset) =>
        asset.status === 'error' && asset.error ? [asset.error] : []
      )
    ),
  ]
  if (problems.length === 0) return null
  return (
    <div role='alert' className='text-destructive flex flex-col'>
      {problems.map((problem) => (
        <span key={problem}>{problem}</span>
      ))}
    </div>
  )
}
