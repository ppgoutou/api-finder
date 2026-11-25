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
import { Clock, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import { remainingParts, type WorkRetention } from '../lib/work-retention'

/**
 * Shows over a work's media how long it stays available, so the user
 * downloads it before its link stops working.
 */
export function WorkRetentionBadge(props: {
  retention: WorkRetention | null
  now: number
  className?: string
}) {
  const { t } = useTranslation()
  const retention = props.retention
  if (!retention) return null

  let content = (
    <>
      <Clock aria-hidden />
      {t('Kept until {{date}}', {
        date: dayjs(retention.expiresAt * 1000).format('YYYY-MM-DD'),
      })}
    </>
  )
  let className = 'bg-background/85 text-foreground backdrop-blur'
  if (retention.state === 'expired') {
    className = 'bg-destructive text-destructive-foreground'
    content = (
      <>
        <TriangleAlert aria-hidden />
        {t('Expired')}
      </>
    )
  }
  if (retention.state === 'expiring') {
    const remaining = remainingParts(retention.expiresAt, props.now)
    let remainingText = t('Expires in {{value}} minutes', {
      value: remaining.value,
    })
    if (remaining.unit === 'day') {
      remainingText = t('Expires in {{value}} days', { value: remaining.value })
    }
    if (remaining.unit === 'hour') {
      remainingText = t('Expires in {{value}} hours', {
        value: remaining.value,
      })
    }
    className = 'border-transparent bg-warning text-warning-foreground'
    content = (
      <>
        <Clock aria-hidden />
        {remainingText}
      </>
    )
  }
  return (
    <Badge
      variant='secondary'
      className={cn(
        'pointer-events-none absolute top-2 left-2 z-10 max-w-[calc(100%-1rem)] shadow-sm',
        className,
        props.className
      )}
      data-retention={retention.state}
    >
      {content}
    </Badge>
  )
}
