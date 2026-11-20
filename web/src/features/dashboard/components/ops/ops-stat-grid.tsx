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
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import type { OpsDashboardData } from '../../types'

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

export type OpsSectionTone =
  | 'neutral'
  | 'wallet'
  | 'users'
  | 'topups'
  | 'tasks'
  | 'profit'

// Each section keeps one chart color for its badge, icon and edge, so the
// five blocks read apart at a glance.
const SECTION_TONES: Record<OpsSectionTone, { edge: string; badge: string; icon: string }> = {
  neutral: { edge: 'border-l-foreground/40', badge: 'bg-muted', icon: 'text-muted-foreground' },
  wallet: { edge: 'border-l-chart-1', badge: 'bg-chart-1/15', icon: 'text-chart-1' },
  users: { edge: 'border-l-chart-3', badge: 'bg-chart-3/15', icon: 'text-chart-3' },
  topups: { edge: 'border-l-chart-2', badge: 'bg-chart-2/15', icon: 'text-chart-2' },
  tasks: { edge: 'border-l-chart-6', badge: 'bg-chart-6/15', icon: 'text-chart-6' },
  profit: { edge: 'border-l-chart-5', badge: 'bg-chart-5/15', icon: 'text-chart-5' },
}

export function OpsSection(props: {
  id: string
  title: string
  description?: string
  /** Number shown in the badge and in the section navigation. */
  index?: number
  tone?: OpsSectionTone
  icon?: LucideIcon
  children: ReactNode
}) {
  const tone = SECTION_TONES[props.tone ?? 'neutral']
  const Icon = props.icon
  return (
    <section
      id={props.id}
      aria-labelledby={`${props.id}-title`}
      className={cn(
        'bg-card scroll-mt-16 overflow-hidden rounded-2xl border border-l-4',
        tone.edge
      )}
    >
      <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-4 py-3 sm:px-5'>
        {props.index != null && (
          <span
            className={cn(
              'text-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums',
              tone.badge
            )}
          >
            {props.index}
          </span>
        )}
        {Icon != null && (
          <Icon className={cn('size-5 shrink-0', tone.icon)} aria-hidden='true' />
        )}
        <h2 id={`${props.id}-title`} className='text-body-lg font-semibold'>
          {props.title}
        </h2>
        {props.description != null && (
          <p className='text-muted-foreground basis-full text-xs sm:basis-auto'>
            {props.description}
          </p>
        )}
      </div>
      <div className='bg-muted/30 space-y-3 p-3 sm:p-4'>{props.children}</div>
    </section>
  )
}

// Wide-screen column counts, chosen so each grid fills whole rows.
const GRID_COLUMNS = {
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-3 xl:grid-cols-5',
  6: 'sm:grid-cols-3 xl:grid-cols-6',
  7: 'sm:grid-cols-4 xl:grid-cols-7',
} as const

export function OpsStatGrid(props: {
  stats: OpsStat[]
  loading: boolean
  footer?: ReactNode
  /** Columns on wide screens; six by default. */
  columns?: keyof typeof GRID_COLUMNS
}) {
  return (
    <div className='bg-card overflow-hidden rounded-lg border'>
      {/* Negative margins hide the outer cell borders whatever the wrap. */}
      <div
        className={cn(
          '-mr-px -mb-px grid grid-cols-2',
          GRID_COLUMNS[props.columns ?? 6]
        )}
      >
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
                className='text-foreground mt-1 truncate font-mono text-lg font-semibold tracking-tight tabular-nums sm:mt-1.5 sm:text-2xl'
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

/** What every dashboard section receives from the page. */
export interface OpsSectionProps {
  data: OpsDashboardData | undefined
  loading: boolean
  allTime: boolean
  channel: string
}
