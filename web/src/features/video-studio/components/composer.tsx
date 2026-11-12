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
import { ArrowUp, Film, Images, Layers } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { createVideoTask } from '../api'
import { ASSET_RETENTION_DAYS } from '../constants'
import { assetKindOf, useAssetUploader } from '../hooks/use-asset-uploader'
import { useStudioBalance } from '../hooks/use-studio-balance'
import { useStudioDraft } from '../hooks/use-studio-draft'
import { useStudioModels } from '../hooks/use-studio-models'
import { useStudioPrice } from '../hooks/use-studio-price'
import {
  buildVideoRequest,
  findStudioModel,
  fitDraftToModel,
  labelReferences,
  replacementModel,
  validateDraft,
} from '../lib/draft'
import { promptGuide } from '../lib/prompt-guide'
import { rememberTaskPrompt } from '../lib/prompt-history'
import type { StudioDraft, StudioMode } from '../types'
import { ChoiceMenu } from './choice-menu'
import { ParamsPopover } from './params-popover'
import { PromptInput } from './prompt-input'
import { FramePanel, ReferencePanel } from './reference-panel'
import { StudioCost } from './studio-cost'
import { UnavailableModelNotice } from './unavailable-model-notice'

interface ComposerProps {
  /** Called after tasks are created, so the works list can refresh. */
  onSubmitted: () => void
  /** Model picked on entry, such as from a pricing card's try button. */
  initialModel?: string
  /** A past request loaded back for editing; takes over the initial model. */
  initialDraft?: Partial<StudioDraft>
}

/** Prompt box with references, mode, model and output settings. */
export function Composer(props: ComposerProps) {
  const { t } = useTranslation()
  const studio = useStudioDraft(
    props.initialDraft ??
      (props.initialModel ? { model: props.initialModel } : undefined)
  )
  const models = useStudioModels()
  const draft = fitDraftToModel(studio.draft, models)
  const model = findStudioModel(models, draft.model)
  const upload = useAssetUploader()
  const price = useStudioPrice(draft)
  const balance = useStudioBalance(price?.costUSD ?? null)
  const insufficient = balance.shortfallUSD !== null
  const [submitting, setSubmitting] = useState(false)
  const unavailable = model?.unavailable === true
  let problem = model ? validateDraft(draft) : 'No video model is available'
  if (unavailable) {
    problem = 'This model is temporarily unavailable. Pick another model.'
  }

  const addReferences = (files: File[]) => {
    const rejected = files.filter((file) => !assetKindOf(file))
    if (rejected.length) {
      toast.error(
        t(
          'Unsupported file type. Upload a JPG, PNG or WebP image, an MP4 or MOV video, or an MP3, WAV or M4A audio file.'
        )
      )
    }
    for (const file of files) {
      const kind = assetKindOf(file)
      if (kind) upload(file, kind, studio.putReference)
    }
  }

  const submit = async () => {
    if (problem) {
      toast.error(t(problem))
      return
    }
    if (insufficient) return
    setSubmitting(true)
    const body = buildVideoRequest(draft)
    const spec = `${body.model} · ${body.resolution} · ${t('{{seconds}}s', { seconds: body.seconds })}`
    let created = 0
    try {
      for (let index = 0; index < draft.count; index += 1) {
        const taskId = await createVideoTask(body)
        rememberTaskPrompt(taskId, body, spec)
        created += 1
      }
      toast.success(
        t('Submitted. Videos usually take a few minutes; they appear below.')
      )
    } catch (error) {
      toast.error(getServerErrorMessage(error, t('Task submission failed')))
    } finally {
      setSubmitting(false)
      balance.refresh()
      if (created > 0) props.onSubmitted()
    }
  }

  const modeOptions: { value: StudioMode; label: string; icon: ReactNode }[] = [
    {
      value: 'reference',
      label: t('Reference generation'),
      icon: <Images className='size-3.5' aria-hidden />,
    },
    {
      value: 'frames',
      label: t('First and last frame'),
      icon: <Layers className='size-3.5' aria-hidden />,
    },
  ]

  return (
    <div className='bg-card border-border/70 focus-within:border-primary/50 rounded-2xl border p-3 shadow-sm transition-colors'>
      <div className='flex flex-col gap-3 sm:flex-row'>
        {draft.mode === 'reference' ? (
          <ReferencePanel
            references={draft.references}
            onAddFiles={addReferences}
            onRemove={studio.removeReference}
          />
        ) : (
          <FramePanel
            firstFrame={draft.firstFrame}
            lastFrame={draft.lastFrame}
            onSetFrame={(slot, file) =>
              upload(file, 'image', (asset) => studio.putFrame(slot, asset))
            }
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
                }))
              : []
          }
          placeholder={
            draft.mode === 'reference'
              ? t(
                  'Describe the video. Type @ to mention an uploaded file, e.g. use the motion of @视频1 and the character in @图片1.'
                )
              : t(
                  'Describe how the video moves from the first frame to the last frame.'
                )
          }
          onSubmit={submit}
          guide={promptGuide(model?.name)}
        />
      </div>

      <div className='mt-2 flex flex-wrap items-center gap-1'>
        <ChoiceMenu
          label={t('Mode')}
          value={draft.mode}
          options={modeOptions}
          onChange={(mode) => studio.update({ mode })}
        />
        {model && (
          <>
            <ChoiceMenu
              label={t('Model')}
              value={draft.model}
              options={models.map((option) => ({
                value: option.name,
                label: option.label ?? option.name,
                group: option.group,
                icon: <Film className='size-3.5' aria-hidden />,
                unavailableLabel: option.unavailable
                  ? t('Temporarily unavailable')
                  : undefined,
              }))}
              onChange={(name) => studio.update({ model: name })}
            />
            <ParamsPopover
              draft={draft}
              model={model}
              onChange={studio.update}
            />
          </>
        )}
        <div className='ml-auto flex items-center gap-3'>
          <StudioCost price={price} shortfallUSD={balance.shortfallUSD} />
          <Button
            type='button'
            size='icon'
            className='size-9 rounded-full'
            onClick={submit}
            disabled={submitting || insufficient || unavailable}
            aria-label={t('Generate video')}
            title={problem ? t(problem) : t('Generate video')}
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
