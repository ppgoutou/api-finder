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

import { Progress } from '@/components/ui/progress'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatPercent } from '@/lib/format'

import { percentOf } from '../../lib/ops'

export interface OpsFunnelStep {
  key: string
  label: string
  value: number
}

/**
 * Steps of a funnel, each as a bar against the first step with the share it
 * kept of the step before it.
 */
export function OpsFunnelList(props: { steps: OpsFunnelStep[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const first = props.steps[0]?.value ?? 0

  return (
    <ol className='space-y-3'>
      {props.steps.map((step, index) => {
        const previous = index > 0 ? props.steps[index - 1].value : null
        return (
          <li key={step.key}>
            <div className='flex justify-between gap-3 text-sm'>
              <span>{step.label}</span>
              <span className='shrink-0 font-mono tabular-nums'>
                {formatNumber(step.value, locale)}
                {previous != null && (
                  <span
                    className='text-muted-foreground ml-1.5'
                    title={t('Share of the previous step')}
                  >
                    {formatPercent(percentOf(step.value, previous))}
                  </span>
                )}
              </span>
            </div>
            <Progress
              value={first > 0 ? (step.value / first) * 100 : 0}
              aria-label={step.label}
              className='mt-1.5'
            />
          </li>
        )
      })}
    </ol>
  )
}
