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
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StudioModel } from '@/features/video-studio/constants'
import { fitStudioSeconds } from '@/features/video-studio/lib/draft'
import {
  formatGallerySpec,
  type ParsedGallerySpec,
  parseGallerySpec,
} from '@/features/video-studio/lib/gallery-draft'
import type { StudioRatio } from '@/features/video-studio/types'

type Option = { value: string; label: string }

/** Lengths a model takes: its listed ones, else every second in its range. */
function durationOptions(model: StudioModel): number[] {
  if (model.durations?.length) return [...model.durations]
  const [shortest, longest] = model.duration
  return Array.from(
    { length: longest - shortest + 1 },
    (_, index) => shortest + index
  )
}

/**
 * The spec of a newly picked model: the previous ratio, resolution and length
 * where the model takes them, else its standard ones (the same fallbacks the
 * studio composer uses).
 */
function specForModel(
  model: StudioModel,
  previous: ParsedGallerySpec
): ParsedGallerySpec {
  const ratios: readonly StudioRatio[] = model.ratios.filter(
    (ratio) => ratio !== 'auto'
  )
  const ratio =
    previous.ratio && ratios.includes(previous.ratio)
      ? previous.ratio
      : (ratios.find((value) => value === '16:9') ?? ratios[0])
  const resolution =
    previous.resolution && model.resolutions.includes(previous.resolution)
      ? previous.resolution
      : model.resolutions.at(-1)
  return {
    model: model.name,
    ratio,
    resolution,
    seconds: fitStudioSeconds(model, previous.seconds ?? 5),
  }
}

function SpecSelect(props: {
  label: string
  value: string | undefined
  options: Option[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </span>
      <Select
        items={props.options}
        value={props.value ?? null}
        disabled={props.disabled}
        onValueChange={(value) => {
          if (typeof value === 'string') props.onChange(value)
        }}
      >
        <SelectTrigger className='w-full' aria-label={props.label}>
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

type GallerySpecFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  /** Model series to pick from (`gallerySeries` of the studio models). */
  series: readonly StudioModel[]
}

/**
 * Model series, aspect ratio, resolution and duration of a gallery work,
 * picked from what the series' studio models take and stored as one spec line.
 */
export function GallerySpecField<T extends FieldValues>(
  props: GallerySpecFieldProps<T>
) {
  const { t } = useTranslation()

  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => {
        const spec = parseGallerySpec(String(field.value ?? ''))
        const model = props.series.find((item) => item.name === spec.model)
        const update = (next: ParsedGallerySpec) =>
          field.onChange(formatGallerySpec(next))

        const modelOptions: Option[] = props.series.map((item) => ({
          value: item.name,
          label: item.name,
        }))
        // A model saved earlier and since removed stays visible so it can be replaced.
        if (spec.model && !model) {
          modelOptions.push({
            value: spec.model,
            label: t('{{model}} (not available)', { model: spec.model }),
          })
        }
        const ratioOptions: Option[] = (model?.ratios ?? [])
          .filter(
            (ratio): ratio is Exclude<StudioRatio, 'auto'> => ratio !== 'auto'
          )
          .map((ratio) => ({ value: ratio, label: ratio }))
        const resolutionOptions: Option[] = (model?.resolutions ?? []).map(
          (resolution) => ({
            value: resolution,
            label: resolution.toUpperCase(),
          })
        )
        const secondsOptions: Option[] = (
          model ? durationOptions(model) : []
        ).map((seconds) => ({
          value: String(seconds),
          label: t('{{seconds}}s', { seconds }),
        }))

        return (
          <FormItem>
            <FormLabel>{t('Generation parameters')}</FormLabel>
            <FormControl>
              <div className='grid gap-3 sm:grid-cols-4'>
                <SpecSelect
                  label={t('Model')}
                  value={spec.model}
                  options={modelOptions}
                  placeholder={t('Select a model')}
                  disabled={modelOptions.length === 0}
                  onChange={(name) => {
                    const next = props.series.find((item) => item.name === name)
                    if (next) update(specForModel(next, spec))
                  }}
                />
                <SpecSelect
                  label={t('Aspect ratio')}
                  value={spec.ratio}
                  options={ratioOptions}
                  placeholder={t('Select')}
                  disabled={!model}
                  onChange={(ratio) =>
                    update({ ...spec, ratio: ratio as StudioRatio })
                  }
                />
                <SpecSelect
                  label={t('Resolution')}
                  value={spec.resolution}
                  options={resolutionOptions}
                  placeholder={t('Select')}
                  disabled={!model}
                  onChange={(resolution) => update({ ...spec, resolution })}
                />
                <SpecSelect
                  label={t('Video duration')}
                  value={
                    spec.seconds === undefined
                      ? undefined
                      : String(spec.seconds)
                  }
                  options={secondsOptions}
                  placeholder={t('Select')}
                  disabled={!model}
                  onChange={(seconds) =>
                    update({ ...spec, seconds: Number(seconds) })
                  }
                />
              </div>
            </FormControl>
            <FormDescription>
              {props.series.length === 0
                ? t('No video models are available in the studio yet.')
                : t('Use prompt fills the studio form with these parameters.')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
