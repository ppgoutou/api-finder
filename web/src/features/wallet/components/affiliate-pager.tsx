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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface AffiliatePagerProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

/** Previous/next paging for the referral lists; hidden on a single page. */
export function AffiliatePager(props: AffiliatePagerProps) {
  const { t } = useTranslation()
  if (props.totalPages <= 1) return null
  return (
    <div className='flex items-center justify-end gap-1 pt-1'>
      <Button
        variant='ghost'
        size='sm'
        onClick={() => props.onPageChange(props.page - 1)}
        disabled={props.page <= 1}
        className='h-8 w-8 p-0'
        aria-label={t('Previous page')}
      >
        <ChevronLeft className='h-4 w-4' />
      </Button>
      <span className='text-muted-foreground text-sm tabular-nums'>
        {props.page} / {props.totalPages}
      </span>
      <Button
        variant='ghost'
        size='sm'
        onClick={() => props.onPageChange(props.page + 1)}
        disabled={props.page >= props.totalPages}
        className='h-8 w-8 p-0'
        aria-label={t('Next page')}
      >
        <ChevronRight className='h-4 w-4' />
      </Button>
    </div>
  )
}
