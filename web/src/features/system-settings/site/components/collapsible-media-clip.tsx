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
import { ChevronDown, Film } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type CollapsibleMediaClipProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible name of the clip region. */
  label: string
  title: string
  /** Secondary line under the title, e.g. category · spec. */
  subtitle?: string
  poster?: string
  video?: string
  /** Move / remove controls kept outside the expand trigger. */
  toolbar?: ReactNode
  children: ReactNode
}

function ClipThumbnail(props: {
  poster?: string
  video?: string
  label: string
}) {
  const cover = props.poster?.trim()
  const video = props.video?.trim()
  if (cover) {
    return (
      <img
        src={cover}
        alt=''
        className='size-full object-cover'
        aria-hidden
      />
    )
  }
  if (video) {
    return (
      <video
        src={video}
        muted
        preload='metadata'
        className='size-full object-cover'
        aria-hidden
      />
    )
  }
  return (
    <span className='text-muted-foreground flex size-full items-center justify-center'>
      <Film className='size-5' aria-hidden />
    </span>
  )
}

/**
 * Compact thumbnail row that expands into the full media/prompt editor.
 * Form fields stay mounted so collapsed clips still validate and save.
 */
export function CollapsibleMediaClip(props: CollapsibleMediaClipProps) {
  const { t } = useTranslation()
  const title = props.title.trim() || t('Untitled')
  const subtitle = props.subtitle?.trim()

  return (
    <Collapsible
      open={props.open}
      onOpenChange={props.onOpenChange}
      render={<section aria-label={props.label} />}
      className='bg-muted/30 overflow-hidden rounded-md border'
    >
      <div className='flex items-stretch gap-1 p-2'>
        <CollapsibleTrigger
          className='flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2'
          aria-label={
            props.open
              ? t('Collapse {{title}}', { title })
              : t('Edit {{title}}', { title })
          }
        >
          <span className='bg-muted relative size-14 shrink-0 overflow-hidden rounded-md border'>
            <ClipThumbnail
              poster={props.poster}
              video={props.video}
              label={props.label}
            />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-semibold'>{title}</span>
            {subtitle && (
              <span className='text-muted-foreground block truncate text-xs'>
                {subtitle}
              </span>
            )}
            {!props.open && (
              <span className='text-muted-foreground mt-0.5 block text-xs'>
                {t('Click to edit')}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              props.open && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        {props.toolbar && (
          <div className='flex shrink-0 items-center gap-1'>{props.toolbar}</div>
        )}
      </div>
      <CollapsibleContent keepMounted className='border-t'>
        <div className='flex flex-col gap-4 p-4'>{props.children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
