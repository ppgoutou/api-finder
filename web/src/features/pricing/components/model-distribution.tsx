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

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import {
  UNCATEGORIZED_CATEGORY,
  type PricingCategorySection,
} from '../lib/categories'

type ModelDistributionProps = {
  /** Sections built from every enabled model, not the filtered list. */
  sections: PricingCategorySection[]
  className?: string
}

/** Hero line naming every category that holds an enabled model. */
export function ModelDistribution(props: ModelDistributionProps) {
  const { t } = useTranslation()
  if (props.sections.length === 0) return null

  return (
    <ul
      aria-label={t('Model distribution')}
      className={cn(
        'mx-auto mt-3 flex max-w-2xl flex-wrap justify-center gap-1.5',
        props.className
      )}
    >
      {props.sections.map((section) => (
        <li key={section.id}>
          <Badge variant='outline' className='bg-background/60 h-6 px-2.5'>
            {section.id === UNCATEGORIZED_CATEGORY
              ? t('Other models')
              : section.name}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
