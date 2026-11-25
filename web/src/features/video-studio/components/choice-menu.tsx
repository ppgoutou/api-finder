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
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ChoiceMenuProps<T extends string> {
  /** Menu heading and accessible name of the trigger. */
  label: string
  value: T
  /**
   * Consecutive options with the same non-empty group get a heading. An
   * option with an unavailable label can't be picked and shows the label.
   */
  options: {
    value: T
    label: string
    icon?: ReactNode
    group?: string
    unavailableLabel?: string
    /** Second line, such as what a model can do. */
    description?: string
    /** Text at the end of the row, such as the price. */
    detail?: string
  }[]
  /** Shown after the label on the trigger. */
  triggerDetail?: string
  onChange: (value: T) => void
}

/** Compact toolbar button that picks one value from a short list. */
export function ChoiceMenu<T extends string>(props: ChoiceMenuProps<T>) {
  const selected = props.options.find((option) => option.value === props.value)
  const sections: { group: string; options: ChoiceMenuProps<T>['options'] }[] =
    []
  for (const option of props.options) {
    const group = option.group ?? ''
    const last = sections.at(-1)
    if (last && last.group === group) last.options.push(option)
    else sections.push({ group, options: [option] })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-label={`${props.label}: ${selected?.label ?? props.value}`}
            className={cn(
              'h-8 max-w-full gap-1.5 rounded-full px-2.5 text-xs',
              selected?.unavailableLabel && 'text-warning hover:text-warning'
            )}
          />
        }
      >
        {selected?.icon}
        <span className='max-w-48 truncate'>
          {selected?.label ?? props.value}
        </span>
        {props.triggerDetail && (
          <span className='text-muted-foreground font-normal tabular-nums'>
            {props.triggerDetail}
          </span>
        )}
        <ChevronDown className='size-3.5 opacity-60' aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='w-auto max-w-[calc(100vw-1.5rem)] min-w-48'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{props.label}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={(value) => props.onChange(value as T)}
        >
          {sections.map((section) => (
            <DropdownMenuGroup key={section.options[0].value}>
              {section.group && (
                <DropdownMenuLabel className='text-muted-foreground text-caption pt-2'>
                  {section.group}
                </DropdownMenuLabel>
              )}
              {section.options.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  disabled={Boolean(option.unavailableLabel)}
                  className='whitespace-nowrap'
                >
                  {option.icon}
                  {option.description ? (
                    <span className='flex flex-col'>
                      <span>{option.label}</span>
                      <span className='text-muted-foreground text-caption'>
                        {option.description}
                      </span>
                    </span>
                  ) : (
                    option.label
                  )}
                  {option.detail && !option.unavailableLabel && (
                    <span className='text-muted-foreground ml-auto pl-6 text-xs tabular-nums'>
                      {option.detail}
                    </span>
                  )}
                  {option.unavailableLabel && (
                    <span className='bg-warning/15 text-warning text-micro ml-auto rounded-md px-1.5 py-0.5 leading-4'>
                      {option.unavailableLabel}
                    </span>
                  )}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
