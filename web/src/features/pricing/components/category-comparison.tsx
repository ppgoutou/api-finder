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
import { Scale } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

/**
 * Link under a category heading that opens how its models differ, on hover
 * or on click (touch screens have no hover).
 */
export function CategoryComparison(props: {
  categoryName: string
  comparison: string
}) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        render={
          <Button
            variant='link'
            size='xs'
            className='text-primary h-auto px-0 py-0'
          />
        }
      >
        <Scale aria-hidden='true' />
        {t('Model comparison')}
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='max-h-[min(70vh,32rem)] w-[min(92vw,30rem)] overflow-y-auto p-4'
      >
        <PopoverHeader>
          <PopoverTitle>
            {t('{{name}} model comparison', { name: props.categoryName })}
          </PopoverTitle>
        </PopoverHeader>
        <Markdown className='text-sm leading-relaxed'>
          {props.comparison}
        </Markdown>
      </PopoverContent>
    </Popover>
  )
}
