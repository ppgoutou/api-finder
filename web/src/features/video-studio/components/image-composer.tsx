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
import { useQueryClient } from '@tanstack/react-query'
import {
  Copy,
  Image as ImageIcon,
  Maximize,
  RectangleHorizontal,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useStudioImageWorks } from '@/stores/studio-image-works-store'

import { generateImages } from '../api'
import {
  ASSET_ACCEPT,
  DEFAULT_IMAGE_SIZE,
  STUDIO_IMAGE_SIZES,
  STUDIO_MAX_IMAGE_COUNT,
  STUDIO_WORKS_QUERY_KEY,
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
import { markDraftSubmitted } from '../lib/draft-storage'
import {
  buildImageRequests,
  fitPluginImageShape,
  imageShapeLabel,
  validateImageDraft,
  type ImageDraft,
} from '../lib/image-draft'
import { localizeMentions } from '../lib/mention-names'
import {
  composerHintIds,
  PROMPT_TOO_LONG,
  promptGuide,
  promptLength,
} from '../lib/prompt-guide'
import type { StudioDraft } from '../types'
import { ChoiceMenu } from './choice-menu'
import { ComposerCard } from './composer-card'
import { FileProblems } from './file-notes'
import { PromptInput } from './prompt-input'
import { ReferencePanel } from './reference-panel'
import { StudioCost } from './studio-cost'
import { UnavailableModelNotice } from './unavailable-model-notice'

interface ImageComposerProps {
  /** Called as soon as a submission starts, when its cards already show. */
  onSubmitted?: () => void
  /** Model picked on entry, such as from a pricing card's try button. */
  initialModel?: string
  /** A past image loaded back for editing; takes over the initial model. */
  initialDraft?: Partial<StudioDraft>
  initialSize?: string
}

const SUBMIT_LOCK_MS = 1500

/** Prompt box for image generation: reference images, model, size, count. */
export function ImageComposer(props: ImageComposerProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const userId = useAuthStore((state) => state.auth.user?.id)
  const studio = useStudioDraft('image', {
    draft: props.initialDraft,
    model: props.initialModel,
    size: props.initialSize,
  })
  const models = useStudioImageModels()
  const queryClient = useQueryClient()
  const addWorks = useStudioImageWorks((state) => state.add)
  const startGenerating = useStudioImageWorks((state) => state.startGenerating)
  const stopGenerating = useStudioImageWorks((state) => state.stopGenerating)
  const upload = useAssetUploader()
  // Kept as "2048x2048", or for a plugin model as "2K 16:9", "2K" or "16:9".
  const shapeParts = studio.size?.split(' ') ?? []
  const size =
    STUDIO_IMAGE_SIZES.find((option) => option.value === studio.size)?.value ??
    DEFAULT_IMAGE_SIZE
  const pluginSize = shapeParts.find((part) => !part.includes(':')) ?? ''
  const pluginRatio = shapeParts.find((part) => part.includes(':')) ?? ''
  const setPluginShape = (nextSize: string, nextRatio: string) =>
    studio.setSize([nextSize, nextRatio].filter(Boolean).join(' '))
  // A second click right after the first one is taken for the same click; the
  // next request may start while this one is still running.
  const [justSubmitted, setJustSubmitted] = useState(false)
  const unlockTimer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(unlockTimer.current), [])
  const model = findStudioModel(models, studio.draft.model)
  const unavailable = model?.unavailable === true
  const plugin = model?.plugin
  const shape = plugin
    ? fitPluginImageShape(plugin, pluginSize, pluginRatio)
    : { size }
  const draft: ImageDraft = {
    model: model?.name ?? '',
    prompt: studio.draft.prompt,
    ...shape,
    count: Math.min(studio.draft.count, STUDIO_MAX_IMAGE_COUNT),
    references: studio.draft.references,
  }
  const price = useStudioImagePrice(draft.model, draft.size, draft.count)
  const balance = useStudioBalance(price?.costUSD ?? null)
  const insufficient = balance.shortfallUSD !== null
  let problem = model
    ? validateImageDraft(draft, plugin)
    : 'No image model is available'
  const guide = promptGuide(model?.name)
  const hintId = useId()
  if (!problem && model && promptLength(draft.prompt) > guide.maxLength) {
    problem = PROMPT_TOO_LONG
  }
  if (unavailable) {
    problem = 'This model is temporarily unavailable. Pick another model.'
  }
  const problemParams = { max: formatNumber(guide.maxLength, locale) }

  const addReferences = (files: File[]) => {
    const images = files.filter((file) => assetKindOf(file) === 'image')
    if (images.length < files.length) {
      toast.error(t('Unsupported file type. Upload a JPG, PNG or WebP image.'))
    }
    for (const file of images) upload(file, 'image', studio.putReference)
  }

  const submit = async () => {
    if (problem) {
      toast.error(t(problem, problemParams))
      return
    }
    if (insufficient || justSubmitted) return
    setJustSubmitted(true)
    unlockTimer.current = window.setTimeout(
      () => setJustSubmitted(false),
      SUBMIT_LOCK_MS
    )
    const requests = buildImageRequests(draft, plugin)
    const [body] = requests
    const pendingId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    startGenerating({
      id: pendingId,
      prompt: body.prompt,
      model: body.model,
      size: imageShapeLabel(body),
      count: draft.count,
      startedAt: Math.floor(Date.now() / 1000),
    })
    markDraftSubmitted('image', userId, draft.prompt)
    props.onSubmitted?.()
    try {
      const results = await Promise.allSettled(
        requests.map((request) => generateImages(request))
      )
      const images = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : []
      )
      const failed = results.find((result) => result.status === 'rejected')
      if (failed && images.length === 0) throw failed.reason
      const createdAt = Math.floor(Date.now() / 1000)
      addWorks(
        images.map((image, index) => ({
          id: `${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          url: image.url,
          ...(image.thumbnailUrl ? { thumbnailUrl: image.thumbnailUrl } : {}),
          ...(image.expiresAt ? { expiresAt: image.expiresAt } : {}),
          ...(image.taskId ? { taskId: image.taskId } : {}),
          prompt: body.prompt,
          model: body.model,
          size: imageShapeLabel(body),
          ...(body.image ? { references: body.image } : {}),
          createdAt,
        }))
      )
      toast.success(t('Images generated; they appear below.'))
      if (failed) throw failed.reason
    } catch (error) {
      toast.error(getServerErrorMessage(error, t('Image generation failed')))
    } finally {
      stopGenerating(pendingId)
      void queryClient.invalidateQueries({ queryKey: STUDIO_WORKS_QUERY_KEY })
      balance.refresh()
    }
  }

  return (
    <ComposerCard
      prompt={draft.prompt}
      guide={guide}
      hintId={hintId}
      hasContent={draft.prompt !== '' || draft.references.length > 0}
      saved={studio.stored}
      onClear={studio.clear}
      onFiles={addReferences}
      files={<FileProblems assets={draft.references} />}
      toolbar={
        <>
          {model && (
            <ChoiceMenu
              label={t('Model')}
              value={model.name}
              options={models.map((option) => ({
                value: option.name,
                label: option.label ?? option.name,
                group: option.group,
                icon: <ImageIcon className='size-3.5' aria-hidden />,
                unavailableLabel: option.unavailable
                  ? t('Temporarily unavailable')
                  : undefined,
              }))}
              onChange={(name) => studio.update({ model: name })}
            />
          )}
          {!plugin && (
            <ChoiceMenu
              label={t('Size')}
              value={size}
              options={STUDIO_IMAGE_SIZES.map((option) => ({
                value: option.value,
                label: `${option.ratio} · ${option.value.replace('x', '×')}`,
                icon: <Maximize className='size-3.5' aria-hidden />,
              }))}
              onChange={studio.setSize}
            />
          )}
          {plugin && plugin.resolutions.length > 0 && (
            <ChoiceMenu
              label={t('Resolution')}
              value={shape.size}
              options={plugin.resolutions.map((value) => ({
                value,
                label: value,
                icon: <Maximize className='size-3.5' aria-hidden />,
              }))}
              onChange={(value) => setPluginShape(value, pluginRatio)}
            />
          )}
          {plugin && plugin.ratios.length > 0 && (
            <ChoiceMenu
              label={t('Aspect ratio')}
              value={draft.ratio ?? ''}
              options={plugin.ratios.map((value) => ({
                value,
                label: value,
                icon: <RectangleHorizontal className='size-3.5' aria-hidden />,
              }))}
              onChange={(value) => setPluginShape(pluginSize, value)}
            />
          )}
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
        </>
      }
      action={
        <>
          <StudioCost
            price={price}
            detail={[draft.size.replace('x', '×'), draft.ratio]
              .filter(Boolean)
              .join(' · ')
              .concat(` × ${draft.count}`)}
            shortfallUSD={balance.shortfallUSD}
          />
          <Button
            type='button'
            size='xl'
            className='max-md:flex-1'
            onClick={submit}
            disabled={justSubmitted || insufficient || unavailable}
            title={problem ? t(problem, problemParams) : t('Generate image')}
          >
            <ImageIcon aria-hidden />
            {t('Generate image')}
          </Button>
        </>
      }
      notice={
        model &&
        unavailable && (
          <UnavailableModelNotice
            reason={model.unavailableReason}
            replacement={replacementModel(models, model)?.name}
            onSwitch={(name) => studio.update({ model: name })}
          />
        )
      }
    >
      {(plugin?.maxReferences !== 0 || draft.references.length > 0) && (
        <ReferencePanel
          references={draft.references}
          accept={ASSET_ACCEPT.image}
          onAddFiles={addReferences}
          onRemove={studio.removeReference}
        />
      )}
      <PromptInput
        value={draft.prompt}
        onChange={(prompt) => studio.update({ prompt })}
        mentions={labelReferences(draft.references).map(({ asset, token }) => ({
          token,
          fileName: asset.fileName,
          preview: { kind: 'image' as const, url: asset.previewUrl },
        }))}
        placeholder={t('Describe the image you want to create')}
        placeholderExample={t(
          'Type @ to mention an uploaded image, e.g. put the character in @{{image}} on a beach.',
          {
            image: localizeMentions(
              '@图片1',
              i18n.resolvedLanguage || i18n.language
            ).slice(1),
          }
        )}
        onSubmit={submit}
        label={t('Image prompt')}
        describedBy={composerHintIds(hintId)}
        guide={guide}
      />
    </ComposerCard>
  )
}
