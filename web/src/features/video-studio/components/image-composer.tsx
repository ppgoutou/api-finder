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
import { ArrowUp, Copy, Image as ImageIcon, Maximize } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { generateImages } from '../api'
import {
  ASSET_ACCEPT,
  ASSET_RETENTION_DAYS,
  DEFAULT_IMAGE_SIZE,
  STUDIO_IMAGE_SIZES,
  STUDIO_MAX_IMAGE_COUNT,
} from '../constants'
import { assetKindOf, useAssetUploader } from '../hooks/use-asset-uploader'
import { useStudioBalance } from '../hooks/use-studio-balance'
import { useStudioDraft } from '../hooks/use-studio-draft'
import { useStudioImageModels } from '../hooks/use-studio-models'
import { useStudioImagePrice } from '../hooks/use-studio-price'
import {
  findStudioModel,
  labelReferences,
  replacementModel,
} from '../lib/draft'
import { buildImageRequest, validateImageDraft } from '../lib/image-draft'
import { promptGuide } from '../lib/prompt-guide'
import type { StudioDraft } from '../types'
import { ChoiceMenu } from './choice-menu'
import { PromptInput } from './prompt-input'
import { ReferencePanel } from './reference-panel'
import { StudioCost } from './studio-cost'
import { UnavailableModelNotice } from './unavailable-model-notice'

interface ImageComposerProps {
  /** Model picked on entry, such as from a pricing card's try button. */
  initialModel?: string
  /** A past image loaded back for editing; takes over the initial model. */
  initialDraft?: Partial<StudioDraft>
  initialSize?: string
}

/** Prompt box for image generation: reference images, model, size, count. */
export function ImageComposer(props: ImageComposerProps) {
  const { t } = useTranslation()
  const studio = useStudioDraft(
    props.initialDraft ??
      (props.initialModel ? { model: props.initialModel } : undefined)
  )
  const models = useStudioImageModels()
  const addWorks = useStudioImageWorks((state) => state.add)
  const upload = useAssetUploader()
  const [size, setSize] = useState(
    STUDIO_IMAGE_SIZES.find((option) => option.value === props.initialSize)
      ?.value ?? DEFAULT_IMAGE_SIZE
  )
  const [submitting, setSubmitting] = useState(false)
  const model = findStudioModel(models, studio.draft.model)
  const unavailable = model?.unavailable === true
  const draft = {
    model: model?.name ?? '',
    prompt: studio.draft.prompt,
    size,
    count: Math.min(studio.draft.count, STUDIO_MAX_IMAGE_COUNT),
    references: studio.draft.references,
  }
  const price = useStudioImagePrice(draft.model, draft.size, draft.count)
  const balance = useStudioBalance(price?.costUSD ?? null)
  const insufficient = balance.shortfallUSD !== null
  let problem = model
    ? validateImageDraft(draft)
    : 'No image model is available'
  if (unavailable) {
    problem = 'This model is temporarily unavailable. Pick another model.'
  }

  const addReferences = (files: File[]) => {
    const images = files.filter((file) => assetKindOf(file) === 'image')
    if (images.length < files.length) {
      toast.error(t('Unsupported file type. Upload a JPG, PNG or WebP image.'))
    }
    for (const file of images) upload(file, 'image', studio.putReference)
  }

  const submit = async () => {
    if (problem) {
      toast.error(t(problem))
      return
    }
    if (insufficient) return
    setSubmitting(true)
    const body = buildImageRequest(draft)
    try {
      const urls = await generateImages(body)
      const createdAt = Math.floor(Date.now() / 1000)
      addWorks(
        urls.map((url, index) => ({
          id: `${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          url,
          prompt: body.prompt,
          model: body.model,
          size: body.size,
          ...(body.image ? { references: body.image } : {}),
          createdAt,
        }))
      )
      toast.success(t('Images generated; they appear below.'))
    } catch (error) {
      toast.error(getServerErrorMessage(error, t('Image generation failed')))
    } finally {
      setSubmitting(false)
      balance.refresh()
    }
  }

  return (
    <div className='bg-card border-border/70 focus-within:border-primary/50 rounded-2xl border p-3 shadow-sm transition-colors'>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <ReferencePanel
          references={draft.references}
          accept={ASSET_ACCEPT.image}
          onAddFiles={addReferences}
          onRemove={studio.removeReference}
        />
        <PromptInput
          value={draft.prompt}
          onChange={(prompt) => studio.update({ prompt })}
          mentions={labelReferences(draft.references).map(
            ({ asset, token }) => ({ token, fileName: asset.fileName })
          )}
          placeholder={t(
            'Describe the image. Type @ to mention an uploaded image, e.g. put the character in @图片1 on a beach.'
          )}
          onSubmit={submit}
          label={t('Image prompt')}
          guide={promptGuide(model?.name)}
        />
      </div>

      <div className='mt-2 flex flex-wrap items-center gap-1'>
        {model && (
          <ChoiceMenu
            label={t('Model')}
            value={model.name}
            options={models.map((option) => ({
              value: option.name,
              label: option.name,
              group: option.group,
              icon: <ImageIcon className='size-3.5' aria-hidden />,
              unavailableLabel: option.unavailable
                ? t('Temporarily unavailable')
                : undefined,
            }))}
            onChange={(name) => studio.update({ model: name })}
          />
        )}
        <ChoiceMenu
          label={t('Size')}
          value={size}
          options={STUDIO_IMAGE_SIZES.map((option) => ({
            value: option.value,
            label: `${option.ratio} · ${option.value.replace('x', '×')}`,
            icon: <Maximize className='size-3.5' aria-hidden />,
          }))}
          onChange={setSize}
        />
        <ChoiceMenu
          label={t('Images')}
          value={String(draft.count)}
          options={Array.from(
            { length: STUDIO_MAX_IMAGE_COUNT },
            (_, index) => ({
              value: String(index + 1),
              label: t('{{count}} images', { count: index + 1 }),
              icon: <Copy className='size-3.5' aria-hidden />,
            })
          )}
          onChange={(count) => studio.update({ count: Number(count) })}
        />
        <div className='ml-auto flex items-center gap-3'>
          <StudioCost price={price} shortfallUSD={balance.shortfallUSD} />
          <Button
            type='button'
            size='icon'
            className='size-9 rounded-full'
            onClick={submit}
            disabled={submitting || insufficient || unavailable}
            aria-label={t('Generate image')}
            title={problem ? t(problem) : t('Generate image')}
          >
            {submitting ? (
              <Spinner className='size-4' />
            ) : (
              <ArrowUp className='size-4' aria-hidden />
            )}
          </Button>
        </div>
      </div>
      {model && unavailable && (
        <UnavailableModelNotice
          reason={model.unavailableReason}
          replacement={replacementModel(models, model)?.name}
          onSwitch={(name) => studio.update({ model: name })}
        />
      )}
      <p className='text-muted-foreground mt-2 px-1 text-[11px]'>
        {t(
          'Reference files are kept for {{days}} days and then deleted automatically. Uploading requires a positive balance.',
          { days: ASSET_RETENTION_DAYS }
        )}
      </p>
    </div>
  )
}
