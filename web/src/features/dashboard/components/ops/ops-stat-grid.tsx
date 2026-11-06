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
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type OpsStatTone = 'muted' | 'good' | 'bad' | 'warning'

export interface OpsStat {
  key: string
  label: string
  value: string
  fullValue?: string
  hint?: string
  note?: string
  noteTone?: OpsStatTone
}

const NOTE_TONES: Record<OpsStatTone, string> = {
  muted: 'text-muted-foreground',
  good: 'text-success',
  bad: 'text-destructive',
  warning: 'text-warning',
}

export function OpsSection(props: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={props.id} className='scroll-mt-16 space-y-2.5'>
      <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5'>
        <h2 className='text-[15px] font-semibold'>{props.title}</h2>
        {props.description != null && (
          <p className='text-muted-foreground text-xs'>{props.description}</p>
        )}
      </div>
      {props.children}
    </section>
  )
}

export function OpsStatGrid(props: {
  stats: OpsStat[]
  loading: boolean
  footer?: ReactNode
}) {
  return (
    <div className='bg-card overflow-hidden rounded-lg border'>
      {/* Negative margins hide the outer cell borders whatever the wrap. */}
      <div className='-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'>
        {props.stats.map((stat) => (
          <div
            key={stat.key}
            className='border-border/60 min-w-0 border-r border-b px-3 py-2.5 sm:px-5 sm:py-4'
          >
            <div className='text-muted-foreground truncate text-xs font-medium'>
              {stat.label}
            </div>
            {props.loading ? (
              <Skeleton className='mt-2 h-7 w-20' />
            ) : (
              <div
                className='text-foreground mt-1 truncate font-mono text-lg font-bold tracking-tight tabular-nums sm:mt-1.5 sm:text-2xl'
                title={stat.fullValue ?? stat.value}
              >
                {stat.value}
              </div>
            )}
            {stat.hint != null && (
              <div className='text-muted-foreground mt-1 text-xs'>
                {stat.hint}
              </div>
            )}
            <div
              className={cn(
                'mt-0.5 min-h-4 font-mono text-xs tabular-nums',
                NOTE_TONES[stat.noteTone ?? 'muted']
              )}
            >
              {props.loading ? null : stat.note}
            </div>
          </div>
        ))}
      </div>
      {props.footer}
    </div>
  )
}
