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
import { Clock, RectangleHorizontal } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { STUDIO_MAX_COUNT, type StudioModel } from '../constants'
import { fitStudioSeconds } from '../lib/draft'
import type { StudioDraft, StudioRatio } from '../types'

interface OptionRowProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function OptionRow(props: OptionRowProps) {
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </span>
      <ToggleGroup
        aria-label={props.label}
        value={[props.value]}
        onValueChange={(values: string[]) => {
          if (values[0]) props.onChange(values[0])
        }}
        variant='outline'
        size='sm'
        // Equal columns, at most four per row, so labels never overlap.
        className='grid w-full'
        style={
          {
            '--gap': 1,
            gridTemplateColumns: `repeat(${Math.min(props.options.length, 4)}, minmax(0, 1fr))`,
          } as CSSProperties
        }
        spacing={1}
      >
        {props.options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className='data-[pressed]:bg-primary data-[pressed]:text-primary-foreground min-w-12 flex-1'
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

interface ParamsPopoverProps {
  /** Draft already fitted to the model. */
  draft: StudioDraft
  model: StudioModel
  onChange: (patch: Partial<StudioDraft>) => void
}

/** Ratio, resolution, duration and count behind one summary button. */
export function ParamsPopover(props: ParamsPopoverProps) {
  const { t } = useTranslation()
  const draft = props.draft
  const model = props.model
  const [shortest, longest] = model.duration
  const ratioLabel = (ratio: StudioRatio) =>
    ratio === 'auto' ? t('Auto') : ratio

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-8 gap-1.5 rounded-full px-2.5 text-xs'
          />
        }
      >
        <RectangleHorizontal className='size-3.5' aria-hidden />
        {ratioLabel(draft.ratio)}
        <span className='text-muted-foreground'>·</span>
        {draft.resolution.toUpperCase()}
        <span className='text-muted-foreground'>·</span>
        <Clock className='size-3.5' aria-hidden />
        {t('{{seconds}}s', { seconds: draft.seconds })}
        <span className='text-muted-foreground'>·</span>
        {t('{{count}} video(s)', { count: draft.count })}
      </PopoverTrigger>
      <PopoverContent align='start' className='flex w-80 flex-col gap-4'>
        <OptionRow
          label={t('Aspect ratio')}
          value={draft.ratio}
          options={model.ratios.map((ratio) => ({
            value: ratio,
            label: ratioLabel(ratio),
          }))}
          onChange={(ratio) => props.onChange({ ratio: ratio as StudioRatio })}
        />
        <OptionRow
          label={t('Resolution')}
          value={draft.resolution}
          options={model.resolutions.map((resolution) => ({
            value: resolution,
            label: resolution.toUpperCase(),
          }))}
          onChange={(resolution) => props.onChange({ resolution })}
        />
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between text-xs'>
            <span className='text-muted-foreground font-medium'>
              {t('Video duration')}
            </span>
            <span className='font-semibold'>
              {t('{{seconds}}s', { seconds: draft.seconds })}
            </span>
          </div>
          <Slider
            aria-label={t('Video duration')}
            min={shortest}
            max={longest}
            step={1}
            value={[draft.seconds]}
            onValueChange={(value) => {
              const seconds = Array.isArray(value) ? value[0] : value
              props.onChange({ seconds: fitStudioSeconds(model, seconds) })
            }}
          />
          <div className='text-muted-foreground flex justify-between text-caption'>
            <span>{t('{{seconds}}s', { seconds: shortest })}</span>
            <span>{t('{{seconds}}s', { seconds: longest })}</span>
          </div>
        </div>
        <OptionRow
          label={t('Number of videos')}
          value={String(draft.count)}
          options={Array.from({ length: STUDIO_MAX_COUNT }, (_, index) => ({
            value: String(index + 1),
            label: String(index + 1),
          }))}
          onChange={(count) => props.onChange({ count: Number(count) })}
        />
        {draft.count > 1 && (
          <p className='text-muted-foreground -mt-2 text-xs'>
            {t('Each video is a separate task and is charged separately.')}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
