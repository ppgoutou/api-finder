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
import {
  Clapperboard,
  Clock,
  Copy,
  Film,
  Image as ImageIcon,
  Images,
  Layers,
  Maximize,
  RectangleHorizontal,
  Type,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/hooks/use-mobile'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { useAuthStore } from '@/stores/auth-store'

import { STUDIO_MAX_COUNT, type StudioModel } from '../constants'
import { assetKindOf, useAssetUploader } from '../hooks/use-asset-uploader'
import { useRecentTasks } from '../hooks/use-expiring-works'
import { useStudioBalance } from '../hooks/use-studio-balance'
import { useStudioDraft } from '../hooks/use-studio-draft'
import { useStudioModels } from '../hooks/use-studio-models'
import { useStudioPricer, type StudioPrice } from '../hooks/use-studio-price'
import { useVideoSubmit } from '../hooks/use-video-submit'
import {
  buildVideoRequest,
  countReferences,
  draftAssets,
  excessReferences,
  findStudioModel,
  fitDraftToModel,
  labelReferences,
  referenceLimitsOf,
  replacementModel,
  studioDurations,
  validateDraft,
} from '../lib/draft'
import { markDraftSubmitted } from '../lib/draft-storage'
import { localizeMentions } from '../lib/mention-names'
import {
  composerHintIds,
  PROMPT_TOO_LONG,
  promptGuide,
  promptLength,
} from '../lib/prompt-guide'
import { typicalSeconds } from '../lib/work-progress'
import type { StudioDraft, StudioMode, StudioRatio } from '../types'
import { ChoiceMenu } from './choice-menu'
import { ComposerCard } from './composer-card'
import { FileProblems, ReferenceUsage } from './file-notes'
import { ParamsPopover } from './params-popover'
import { PromptInput } from './prompt-input'
import { RecentDrafts } from './recent-drafts'
import { FramePanel, ReferencePanel } from './reference-panel'
import { StudioCost } from './studio-cost'
import { UnavailableModelNotice } from './unavailable-model-notice'

interface ComposerProps {
  /** Called as soon as a submission starts, when its cards already show. */
  onSubmitted: () => void
  /** Model picked on entry, such as from a pricing card's try button. */
  initialModel?: string
  /** A past request loaded back for editing; takes over the initial model. */
  initialDraft?: Partial<StudioDraft>
  /** Opens the model menu at once, to try the request on another model. */
  pickModel?: boolean
}

/** Prompt box with references, mode, model and output settings. */
export function Composer(props: ComposerProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language
  const locale = toIntlLocale(language)
  const isMobile = useIsMobile()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const studio = useStudioDraft('video', {
    draft: props.initialDraft,
    model: props.initialModel,
  })
  const models = useStudioModels()
  const draft = fitDraftToModel(studio.draft, models)
  const model = findStudioModel(models, draft.model)
  const upload = useAssetUploader()
  const priceOf = useStudioPricer()
  const price = priceOf(draft)
  const balance = useStudioBalance(price?.costUSD ?? null)
  const insufficient = balance.shortfallUSD !== null
  const { submit: submitVideos, submitting } = useVideoSubmit()
  const recentTasks = useRecentTasks().tasks ?? []
  const [cheapestFirst, setCheapestFirst] = useState(false)
  const unavailable = model?.unavailable === true
  let problem = model
    ? validateDraft(draft, model)
    : 'No video model is available'
  const guide = promptGuide(model?.name)
  const hintId = useId()
  if (!problem && model && promptLength(draft.prompt) > guide.maxLength) {
    problem = PROMPT_TOO_LONG
  }
  if (unavailable) {
    problem = 'This model is temporarily unavailable. Pick another model.'
  }
  const problemParams = { max: formatNumber(guide.maxLength, locale) }
  const limits = referenceLimitsOf(model)
  const assets = draftAssets(draft)

  const setFrame = (slot: 'first' | 'last', file: File) =>
    upload(file, 'image', (asset) => studio.putFrame(slot, asset))

  const addFiles = (files: File[]) => {
    if (files.some((file) => !assetKindOf(file))) {
      toast.error(
        t(
          'Unsupported file type. Upload a JPG, PNG or WebP image, an MP4 or MOV video, or an MP3, WAV or M4A audio file.'
        )
      )
    }
    const images = files.filter((file) => assetKindOf(file) === 'image')
    const framesMode = draft.mode === 'image' || draft.mode === 'frames'
    if (framesMode && images.length === files.length) {
      const free: ('first' | 'last')[] = []
      if (!draft.firstFrame || draft.mode === 'image') free.push('first')
      if (!draft.lastFrame && draft.mode === 'frames') free.push('last')
      for (const [index, slot] of free.entries()) {
        if (images[index]) setFrame(slot, images[index])
      }
      return
    }
    // Other files only make sense as references.
    if (draft.mode !== 'reference') studio.update({ mode: 'reference' })
    for (const file of files) {
      const kind = assetKindOf(file)
      if (kind) upload(file, kind, studio.putReference)
    }
  }

  const submit = async () => {
    if (submitting) return
    if (problem) {
      toast.error(t(problem, problemParams))
      return
    }
    if (insufficient) return
    const request = buildVideoRequest(draft)
    const created = await submitVideos(request, draft.count, props.onSubmitted)
    if (created > 0) markDraftSubmitted('video', userId, draft.prompt)
  }

  const modes: {
    value: StudioMode
    label: string
    hint: string
    icon: ReactNode
  }[] = [
    {
      value: 'text',
      label: t('Text to video'),
      hint: t('Only words, no files needed'),
      icon: <Type className='size-3.5 max-sm:hidden' aria-hidden />,
    },
    {
      value: 'image',
      label: t('Image to video'),
      hint: t('One image as the opening frame'),
      icon: <ImageIcon className='size-3.5 max-sm:hidden' aria-hidden />,
    },
    {
      value: 'frames',
      label: t('First and last frame'),
      hint: t('Two images, the video moves between them'),
      icon: <Layers className='size-3.5 max-sm:hidden' aria-hidden />,
    },
    {
      value: 'reference',
      label: t('All-in-one reference'),
      hint: t('Images, videos or audio, mentioned with @'),
      icon: <Images className='size-3.5 max-sm:hidden' aria-hidden />,
    },
  ]

  const describeModel = (option: StudioModel) => {
    const [shortest, longest] = option.duration
    const specs = t('{{shortest}}–{{longest}}s · up to {{resolution}}', {
      shortest,
      longest,
      resolution: (option.resolutions.at(-1) ?? '').toUpperCase(),
    })
    const typical = typicalSeconds(recentTasks, option.name)
    if (typical === null) return specs
    return `${specs} · ${t('your recent ones took about {{count}} min', {
      count: Math.max(1, Math.round(typical / 60)),
    })}`
  }
  // Each model priced for the current settings, cheapest first on request;
  // models that cannot run now go last.
  const modelOptions = models.map((option) => ({
    option,
    price: priceOf(fitDraftToModel({ ...draft, model: option.name }, [option])),
  }))
  if (cheapestFirst) {
    modelOptions.sort((a, b) => {
      if (a.option.unavailable !== b.option.unavailable) {
        return a.option.unavailable ? 1 : -1
      }
      return (
        (a.price?.costUSD ?? Number.POSITIVE_INFINITY) -
        (b.price?.costUSD ?? Number.POSITIVE_INFINITY)
      )
    })
  }
  // A model that takes all the files added, when the picked one does not.
  const excess = excessReferences(draft.references, limits)
  const counts = countReferences(draft.references)
  const roomier =
    excess.length > 0
      ? models.find(
          (option) =>
            !option.unavailable &&
            (['image', 'video', 'audio'] as const).every(
              (kind) => counts[kind] <= referenceLimitsOf(option)[kind]
            )
        )
      : undefined
  const ratioLabel = (ratio: StudioRatio) =>
    ratio === 'auto' ? t('Auto') : ratio
  const unitPriceDetail = (unitPrice: StudioPrice) =>
    unitPrice.perVideo
      ? t('{{unit}}/video', { unit: unitPrice.unitLabel })
      : t('{{unit}}/s', { unit: unitPrice.unitLabel })
  let costDetail: string | undefined
  if (price?.perVideo) {
    costDetail = t('≈ {{unit}}/video × {{count}}', {
      unit: price.unitLabel,
      count: draft.count,
    })
  } else if (price) {
    costDetail = t('≈ {{unit}}/s × {{seconds}}s × {{count}}', {
      unit: price.unitLabel,
      seconds: draft.seconds,
      count: draft.count,
    })
  }

  return (
    <ComposerCard
      prompt={draft.prompt}
      guide={guide}
      hintId={hintId}
      hasContent={draft.prompt !== '' || assets.length > 0}
      restoredAt={studio.restoredAt}
      drafts={<RecentDrafts kind='video' onRestore={studio.restore} />}
      saved={studio.stored}
      onClear={studio.clear}
      onFiles={addFiles}
      header={
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
          <ToggleGroup
            aria-label={t('Mode')}
            value={[draft.mode]}
            onValueChange={(values: string[]) => {
              if (values[0]) studio.update({ mode: values[0] as StudioMode })
            }}
            spacing={1}
            className='flex-wrap'
          >
            {modes.map((mode) => (
              <ToggleGroupItem
                key={mode.value}
                value={mode.value}
                className='data-[pressed]:bg-brand-soft data-[pressed]:text-primary dark:data-[pressed]:bg-primary/20 text-body-sm gap-1.5 px-2.5'
              >
                {mode.icon}
                {mode.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className='text-muted-foreground ml-auto px-1 text-xs max-lg:hidden'>
            {modes.find((mode) => mode.value === draft.mode)?.hint}
          </span>
        </div>
      }
      files={
        <>
          {draft.mode === 'reference' && (
            <ReferenceUsage
              references={draft.references}
              limits={limits}
              switchTo={
                roomier
                  ? {
                      label: roomier.label ?? roomier.name,
                      onSwitch: () => studio.update({ model: roomier.name }),
                    }
                  : undefined
              }
              onRemoveExtra={() => {
                for (const asset of excessReferences(
                  draft.references,
                  limits
                )) {
                  studio.removeReference(asset)
                }
              }}
            />
          )}
          <FileProblems assets={assets} />
        </>
      }
      toolbar={
        <>
          {model && (
            <ChoiceMenu
              label={t('Model')}
              value={draft.model}
              defaultOpen={props.pickModel}
              toggle={{
                label: t('Cheapest first'),
                checked: cheapestFirst,
                onChange: setCheapestFirst,
              }}
              options={modelOptions.map(({ option, price: optionPrice }) => ({
                value: option.name,
                label: option.label ?? option.name,
                group: cheapestFirst ? undefined : option.group,
                icon: option.icon ? (
                  <span className='flex size-4 shrink-0 items-center justify-center'>
                    {getLobeIcon(option.icon, 16)}
                  </span>
                ) : (
                  <Film className='size-3.5' aria-hidden />
                ),
                description: describeModel(option),
                detail: optionPrice ? unitPriceDetail(optionPrice) : undefined,
                unavailableLabel: option.unavailable
                  ? t('Temporarily unavailable')
                  : undefined,
              }))}
              onChange={(name) => studio.update({ model: name })}
            />
          )}
          {model && isMobile && (
            <ParamsPopover
              draft={draft}
              model={model}
              onChange={studio.update}
            />
          )}
          {model && !isMobile && (
            <>
              <ChoiceMenu
                label={t('Aspect ratio')}
                value={draft.ratio}
                options={model.ratios.map((ratio) => ({
                  value: ratio,
                  label: ratioLabel(ratio),
                  icon: (
                    <RectangleHorizontal className='size-3.5' aria-hidden />
                  ),
                }))}
                onChange={(ratio) => studio.update({ ratio })}
              />
              <ChoiceMenu
                label={t('Resolution')}
                value={draft.resolution}
                options={model.resolutions.map((resolution) => ({
                  value: resolution,
                  label: resolution.toUpperCase(),
                  icon: <Maximize className='size-3.5' aria-hidden />,
                }))}
                onChange={(resolution) => studio.update({ resolution })}
              />
              <ChoiceMenu
                label={t('Video duration')}
                value={String(draft.seconds)}
                options={studioDurations(model).map((seconds) => ({
                  value: String(seconds),
                  label: t('{{seconds}}s', { seconds }),
                  icon: <Clock className='size-3.5' aria-hidden />,
                }))}
                onChange={(seconds) =>
                  studio.update({ seconds: Number(seconds) })
                }
              />
              <ChoiceMenu
                label={t('Number of videos')}
                value={String(draft.count)}
                options={Array.from(
                  { length: STUDIO_MAX_COUNT },
                  (_, index) => ({
                    value: String(index + 1),
                    label: t('{{count}} video(s)', { count: index + 1 }),
                    icon: <Copy className='size-3.5' aria-hidden />,
                  })
                )}
                onChange={(count) => studio.update({ count: Number(count) })}
              />
            </>
          )}
        </>
      }
      action={
        <>
          <StudioCost
            price={price}
            detail={costDetail}
            shortfallUSD={balance.shortfallUSD}
          />
          <Button
            type='button'
            size='xl'
            className='max-md:flex-1'
            onClick={submit}
            disabled={submitting || insufficient || unavailable}
            title={problem ? t(problem, problemParams) : t('Generate video')}
          >
            {submitting ? (
              <Spinner className='size-4' />
            ) : (
              <Clapperboard aria-hidden />
            )}
            {t('Generate video')}
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
      {draft.mode === 'reference' && (
        <ReferencePanel
          references={draft.references}
          onAddFiles={addFiles}
          onRemove={studio.removeReference}
        />
      )}
      {(draft.mode === 'image' || draft.mode === 'frames') && (
        <FramePanel
          withLastFrame={draft.mode === 'frames'}
          firstFrame={draft.firstFrame}
          lastFrame={draft.lastFrame}
          onSetFrame={setFrame}
          onRemoveFrame={studio.removeFrame}
        />
      )}
      <PromptInput
        value={draft.prompt}
        onChange={(prompt) => studio.update({ prompt })}
        mentions={
          draft.mode === 'reference'
            ? labelReferences(draft.references).map(({ asset, token }) => ({
                token,
                fileName: asset.fileName,
                preview:
                  asset.kind === 'audio'
                    ? undefined
                    : { kind: asset.kind, url: asset.previewUrl },
              }))
            : []
        }
        placeholder={
          draft.mode === 'frames'
            ? t(
                'Describe how the video moves from the first frame to the last frame.'
              )
            : t('Describe the video you want to create')
        }
        placeholderExample={
          draft.mode === 'reference'
            ? t(
                'Type @ to mention an uploaded file, e.g. use the motion of @{{video}} and the character in @{{image}}.',
                {
                  video: localizeMentions('@视频1', language).slice(1),
                  image: localizeMentions('@图片1', language).slice(1),
                }
              )
            : undefined
        }
        describedBy={composerHintIds(hintId)}
        onSubmit={submit}
        guide={guide}
      />
    </ComposerCard>
  )
}
