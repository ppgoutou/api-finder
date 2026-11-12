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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { BatchOperation } from '../../lib/onboarding-markup'

/**
 * Sets the price adjustment of the selected or of all tiers at once: a fixed
 * amount or a percentage of the group-ratio price, up or down. It only fills
 * the table's inputs; the table saves them.
 */
export function OnboardingMarkupBatch(props: {
  symbol: string
  selectedCount: number
  onApply: (
    operation: BatchOperation,
    value: number,
    onlySelected: boolean
  ) => void
  onClear: (onlySelected: boolean) => void
}) {
  const { t } = useTranslation()
  const [operation, setOperation] = useState<BatchOperation>('add')
  const [text, setText] = useState('')
  const percent = operation.endsWith('_percent')
  const value = Number(text.trim())
  const valid =
    text.trim() !== '' &&
    Number.isFinite(value) &&
    value > 0 &&
    !(operation === 'subtract_percent' && value >= 100)
  const hasSelection = props.selectedCount > 0
  const operations: { value: BatchOperation; label: string }[] = [
    { value: 'add', label: t('+ Amount') },
    { value: 'subtract', label: t('− Amount') },
    { value: 'add_percent', label: t('+ Percent') },
    { value: 'subtract_percent', label: t('− Percent') },
  ]

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <ToggleGroup
        value={[operation]}
        onValueChange={(next) => {
          const picked = next.find((item) => item !== operation)
          if (picked) setOperation(picked as BatchOperation)
        }}
        aria-label={t('Batch adjustment type')}
        variant='outline'
        size='sm'
      >
        {operations.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <InputGroup className='w-32'>
        {!percent && (
          <InputGroupAddon>
            <InputGroupText>{props.symbol}</InputGroupText>
          </InputGroupAddon>
        )}
        <InputGroupInput
          inputMode='decimal'
          aria-label={t('Batch adjustment value')}
          aria-invalid={text.trim() !== '' && !valid}
          placeholder='0'
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <InputGroupAddon align='inline-end'>
          <InputGroupText>{percent ? '%' : `/${t('s')}`}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <Button
        size='sm'
        variant='outline'
        disabled={!valid || !hasSelection}
        onClick={() => props.onApply(operation, value, true)}
      >
        {t('Apply to selected ({{count}})', { count: props.selectedCount })}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={!valid}
        onClick={() => props.onApply(operation, value, false)}
      >
        {t('Apply to all')}
      </Button>
      <Button
        size='sm'
        variant='ghost'
        onClick={() => props.onClear(hasSelection)}
      >
        {hasSelection ? t('Clear selected') : t('Clear all')}
      </Button>
    </div>
  )
}
