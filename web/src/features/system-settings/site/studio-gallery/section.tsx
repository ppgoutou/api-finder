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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { STUDIO_GALLERY_QUERY_KEY } from '@/features/video-studio/hooks/use-studio-gallery'
import { useStudioModels } from '@/features/video-studio/hooks/use-studio-models'
import {
  gallerySeries,
  parseGallerySpec,
} from '@/features/video-studio/lib/gallery-draft'
import { promptGuide } from '@/features/video-studio/lib/prompt-guide'
import {
  collectStudioGalleryMedia,
  emptyStudioGalleryItem,
  parseStudioGallery,
  serializeStudioGallery,
  STUDIO_GALLERY_MAX_ITEMS,
  STUDIO_GALLERY_OPTION_KEY,
} from '@/features/video-studio/lib/studio-gallery'

import { deleteHomeMedia } from '../../api'
import { SettingsForm } from '../../components/settings-form-layout'
import { SettingsPageFormActions } from '../../components/settings-page-context'
import { SettingsSection } from '../../components/settings-section'
import { useUpdateOption } from '../../hooks/use-update-option'
import { CollapsibleMediaClip } from '../components/collapsible-media-clip'
import { ShowcaseTextField } from '../home-showcase/item-fields'
import { MediaField } from '../home-showcase/media-field'
import { studioGalleryFormSchema, type StudioGalleryFormValues } from './schema'
import { GallerySpecField } from './spec-field'

type StudioGallerySectionProps = {
  /** The stored `StudioGallery` option. */
  defaultValue: string
  /** Uploaded files the homepage videos use too, never deleted from here. */
  sharedMedia: readonly string[]
}

export function StudioGallerySection(props: StudioGallerySectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateOption = useUpdateOption()
  const studioModels = useStudioModels()
  const series = useMemo(() => gallerySeries(studioModels), [studioModels])
  const initial = useMemo(
    () => parseStudioGallery(props.defaultValue),
    [props.defaultValue]
  )
  const form = useForm<StudioGalleryFormValues>({
    resolver: zodResolver(studioGalleryFormSchema),
    defaultValues: initial,
  })
  const clips = useFieldArray({ control: form.control, name: 'items' })
  const watchedItems = useWatch({ control: form.control, name: 'items' }) ?? []
  const [openClips, setOpenClips] = useState<Record<string, boolean>>({})
  // The clip waiting for the admin to confirm its removal.
  const [removing, setRemoving] = useState<{
    index: number
    id: string
    title: string
  } | null>(null)
  const openNewestClip = useRef(false)

  useEffect(() => {
    form.reset(initial)
    setOpenClips({})
    openNewestClip.current = false
  }, [initial, form])

  useEffect(() => {
    if (!openNewestClip.current) return
    const newest = clips.fields.at(-1)
    if (!newest) return
    openNewestClip.current = false
    setOpenClips((current) => ({ ...current, [newest.id]: true }))
  }, [clips.fields])

  const onSubmit = async (values: StudioGalleryFormValues) => {
    const value = serializeStudioGallery(values)
    if (value === serializeStudioGallery(initial)) return
    const result = await updateOption.mutateAsync({
      key: STUDIO_GALLERY_OPTION_KEY,
      value,
    })
    if (!result.success) return
    await queryClient.invalidateQueries({ queryKey: STUDIO_GALLERY_QUERY_KEY })
    const kept = new Set([
      ...collectStudioGalleryMedia(values),
      ...props.sharedMedia,
    ])
    const removed = collectStudioGalleryMedia(initial).filter(
      (url) => !kept.has(url)
    )
    await Promise.allSettled(removed.map((url) => deleteHomeMedia(url)))
    setOpenClips({})
  }

  return (
    <SettingsSection title={t('Studio gallery')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Works shown under Gallery on the video studio page. Homepage videos are configured separately.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <fieldset className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'>
            <legend className='px-1 text-sm font-semibold'>
              {t('Gallery works')}
            </legend>
            {clips.fields.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {t('No gallery works yet. Add clips for the video studio.')}
              </p>
            )}
            {clips.fields.map((clip, index) => {
              const item = watchedItems[index]
              const label = t('Clip {{number}}', { number: index + 1 })
              const guide = promptGuide(
                parseGallerySpec(item?.spec ?? '').model
              )
              const subtitle = [item?.category, item?.spec]
                .filter(Boolean)
                .join(' · ')
              return (
                <CollapsibleMediaClip
                  key={clip.id}
                  open={Boolean(openClips[clip.id])}
                  onOpenChange={(next) =>
                    setOpenClips((current) => ({
                      ...current,
                      [clip.id]: next,
                    }))
                  }
                  label={label}
                  title={item?.title || label}
                  subtitle={subtitle}
                  poster={item?.poster}
                  video={item?.video}
                  toolbar={
                    <>
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
                        onClick={() =>
                          setRemoving({
                            index,
                            id: clip.id,
                            title: item?.title || label,
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </>
                  }
                >
                  <MediaField
                    control={form.control}
                    name={`items.${index}.video`}
                    label={t('Video')}
                    kind='video'
                  />
                  <MediaField
                    control={form.control}
                    name={`items.${index}.poster`}
                    label={t('Cover image (optional)')}
                    kind='image'
                  />
                  <MediaField
                    control={form.control}
                    name={`items.${index}.image`}
                    label={t('Reference image (optional)')}
                    kind='image'
                  />
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <ShowcaseTextField
                      control={form.control}
                      name={`items.${index}.title`}
                      label={t('Title')}
                    />
                    <ShowcaseTextField
                      control={form.control}
                      name={`items.${index}.category`}
                      label={t('Category')}
                    />
                  </div>
                  <GallerySpecField
                    control={form.control}
                    name={`items.${index}.spec`}
                    series={series}
                  />
                  <ShowcaseTextField
                    control={form.control}
                    name={`items.${index}.prompt`}
                    label={t('Prompt text')}
                    multiline
                    description={t(guide.hint, {
                      max: guide.maxLength,
                    })}
                  />
                </CollapsibleMediaClip>
              )
            })}
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={clips.fields.length >= STUDIO_GALLERY_MAX_ITEMS}
              onClick={() => {
                openNewestClip.current = true
                clips.append(emptyStudioGalleryItem())
              }}
            >
              <Plus data-icon='inline-start' />
              {t('Add clip')}
            </Button>
          </fieldset>
        </SettingsForm>
      </Form>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={t('Remove this clip?')}
        desc={
          <p className='[overflow-wrap:anywhere]'>
            {t(
              '"{{title}}" leaves the gallery when you save, and its uploaded files are deleted then.',
              { title: removing?.title ?? '' }
            )}
          </p>
        }
        confirmText={t('Remove')}
        destructive
        handleConfirm={() => {
          if (!removing) return
          clips.remove(removing.index)
          setOpenClips((current) => {
            const next = { ...current }
            delete next[removing.id]
            return next
          })
          setRemoving(null)
        }}
      />
    </SettingsSection>
  )
}
