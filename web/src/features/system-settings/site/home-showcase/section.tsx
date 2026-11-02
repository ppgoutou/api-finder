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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { HOME_SHOWCASE_QUERY_KEY } from '@/features/home/hooks/use-home-showcase'
import {
  collectUploadedMedia,
  EMPTY_SHOWCASE_ITEM,
  HOME_SHOWCASE_MAX_ITEMS,
  HOME_SHOWCASE_OPTION_KEY,
  parseHomeShowcase,
  serializeHomeShowcase,
} from '@/features/home/lib/home-showcase'

import { deleteHomeMedia } from '../../api'
import { SettingsForm } from '../../components/settings-form-layout'
import { SettingsPageFormActions } from '../../components/settings-page-context'
import { SettingsSection } from '../../components/settings-section'
import { useUpdateOption } from '../../hooks/use-update-option'
import { ShowcaseTextField } from './item-fields'
import { MediaField } from './media-field'
import { homeShowcaseFormSchema, type HomeShowcaseFormValues } from './schema'

type HomeShowcaseSectionProps = {
  /** The stored `HomeShowcase` option. */
  defaultValue: string
}

export function HomeShowcaseSection(props: HomeShowcaseSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const initial = useMemo(
    () => parseHomeShowcase(props.defaultValue),
    [props.defaultValue]
  )
  const form = useForm<HomeShowcaseFormValues>({
    resolver: zodResolver(homeShowcaseFormSchema),
    defaultValues: initial,
  })
  const clips = useFieldArray({ control: form.control, name: 'showcase' })

  useEffect(() => {
    form.reset(initial)
  }, [initial, form])

  const onSubmit = async (values: HomeShowcaseFormValues) => {
    const value = serializeHomeShowcase(values)
    if (value === serializeHomeShowcase(initial)) return
    const result = await updateOption.mutateAsync({
      key: HOME_SHOWCASE_OPTION_KEY,
      value,
    })
    if (!result.success) return
    await queryClient.invalidateQueries({ queryKey: HOME_SHOWCASE_QUERY_KEY })
    // Uploaded files no longer referenced after a successful save are removed
    // from the server; a failed delete only leaves an unused file behind.
    const kept = new Set(collectUploadedMedia(values))
    const removed = collectUploadedMedia(initial).filter(
      (url) => !kept.has(url)
    )
    await Promise.allSettled(removed.map((url) => deleteHomeMedia(url)))
  }

  return (
    <SettingsSection title={t('Homepage videos')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Upload the videos shown on the home page. Slots without a video keep the built-in examples. Changes appear on the home page after saving. Video studio Gallery works are configured under Studio gallery.'
        )}{' '}
        {t(
          'Chinese fields are shown to simplified and traditional Chinese interfaces; leave them empty to show the default text.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <fieldset className='flex flex-col gap-4 rounded-lg border p-4'>
            <legend className='px-1 text-sm font-semibold'>
              {t('Hero video')}
            </legend>
            <MediaField
              control={form.control}
              name='hero.video'
              label={t('Video')}
              kind='video'
            />
            <MediaField
              control={form.control}
              name='hero.poster'
              label={t('Cover image (optional)')}
              kind='image'
            />
            <div className='grid gap-4 sm:grid-cols-2'>
              <ShowcaseTextField
                control={form.control}
                name='hero.title'
                label={t('Title')}
              />
              <ShowcaseTextField
                control={form.control}
                name='hero.spec'
                label={t('Spec label')}
                placeholder='seedance-2.0 · 1080p · 10s'
              />
            </div>
            <ShowcaseTextField
              control={form.control}
              name='hero.prompt'
              label={t('Prompt text')}
              multiline
            />
            <ShowcaseTextField
              control={form.control}
              name='hero.titleZh'
              label={t('Title (Chinese)')}
            />
            <ShowcaseTextField
              control={form.control}
              name='hero.promptZh'
              label={t('Prompt text (Chinese)')}
              multiline
            />
          </fieldset>

          <fieldset className='flex flex-col gap-4 rounded-lg border p-4'>
            <legend className='px-1 text-sm font-semibold'>
              {t('Image to video')}
            </legend>
            <MediaField
              control={form.control}
              name='imageToVideo.image'
              label={t('Input image')}
              kind='image'
            />
            <MediaField
              control={form.control}
              name='imageToVideo.video'
              label={t('Output video')}
              kind='video'
            />
            <MediaField
              control={form.control}
              name='imageToVideo.poster'
              label={t('Cover image (optional)')}
              kind='image'
            />
          </fieldset>

          <fieldset className='flex flex-col gap-4 rounded-lg border p-4'>
            <legend className='px-1 text-sm font-semibold'>
              {t('Showcase clips')}
            </legend>
            {clips.fields.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {t('No clips yet. The home page shows the built-in examples.')}
              </p>
            )}
            {clips.fields.map((clip, index) => (
              <section
                key={clip.id}
                aria-label={t('Clip {{number}}', { number: index + 1 })}
                className='bg-muted/30 flex flex-col gap-4 rounded-md border p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h4 className='text-sm font-semibold'>
                    {t('Clip {{number}}', { number: index + 1 })}
                  </h4>
                  <div className='flex gap-1'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      disabled={index === 0}
                      aria-label={t('Move clip {{number}} up', {
                        number: index + 1,
                      })}
                      onClick={() => clips.move(index, index - 1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      disabled={index === clips.fields.length - 1}
                      aria-label={t('Move clip {{number}} down', {
                        number: index + 1,
                      })}
                      onClick={() => clips.move(index, index + 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label={t('Remove clip {{number}}', {
                        number: index + 1,
                      })}
                      onClick={() => clips.remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <MediaField
                  control={form.control}
                  name={`showcase.${index}.video`}
                  label={t('Video')}
                  kind='video'
                />
                <MediaField
                  control={form.control}
                  name={`showcase.${index}.poster`}
                  label={t('Cover image (optional)')}
                  kind='image'
                />
                <div className='grid gap-4 sm:grid-cols-3'>
                  <ShowcaseTextField
                    control={form.control}
                    name={`showcase.${index}.title`}
                    label={t('Title')}
                  />
                  <ShowcaseTextField
                    control={form.control}
                    name={`showcase.${index}.category`}
                    label={t('Category')}
                  />
                  <ShowcaseTextField
                    control={form.control}
                    name={`showcase.${index}.spec`}
                    label={t('Spec label')}
                    placeholder='seedance-2.0 · 720p · 5s'
                  />
                </div>
                <ShowcaseTextField
                  control={form.control}
                  name={`showcase.${index}.prompt`}
                  label={t('Prompt text')}
                  multiline
                />
                <div className='grid gap-4 sm:grid-cols-3'>
                  <ShowcaseTextField
                    control={form.control}
                    name={`showcase.${index}.titleZh`}
                    label={t('Title (Chinese)')}
                  />
                  <ShowcaseTextField
                    control={form.control}
                    name={`showcase.${index}.categoryZh`}
                    label={t('Category (Chinese)')}
                  />
                </div>
                <ShowcaseTextField
                  control={form.control}
                  name={`showcase.${index}.promptZh`}
                  label={t('Prompt text (Chinese)')}
                  multiline
                />
              </section>
            ))}
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={clips.fields.length >= HOME_SHOWCASE_MAX_ITEMS}
              onClick={() => clips.append({ ...EMPTY_SHOWCASE_ITEM })}
            >
              <Plus data-icon='inline-start' />
              {t('Add clip')}
            </Button>
          </fieldset>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
