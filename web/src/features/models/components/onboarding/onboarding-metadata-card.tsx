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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudDownload, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { TitledCard } from '@/components/ui/titled-card'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  createModel,
  draftOnboardingModel,
  fetchSupplierDescription,
  getModel,
  previewUpstreamDiff,
  updateModel,
} from '../../api'
import { modelsQueryKeys } from '../../lib'
import {
  modelFormSchema,
  transformFormDataToModelPayload,
  transformModelToFormDefaults,
  type ModelFormValues,
} from '../../lib/model-form'
import { joinDescriptions, officialMetadataValues } from '../../lib/onboarding'
import type {
  Model,
  OnboardingDraft,
  OnboardingModel,
  SyncLocale,
  Vendor,
} from '../../types'
import { ModelMetadataFields } from '../model-metadata-fields'

const OFFICIAL_LOCALES: SyncLocale[] = ['zh', 'en']

function newModelDefaults(name: string): ModelFormValues {
  return transformModelToFormDefaults({
    model_name: name,
    status: 1,
    sync_official: 1,
    name_rule: 0,
  } as Model)
}

export function OnboardingMetadataCard(props: {
  item: OnboardingModel
  vendors: Vendor[]
  tags: string[]
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => Promise<void>
  /** Hands the go-live action a way to save unsaved edits first. */
  onRegisterSave?: (save: (() => Promise<void>) | null) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const metadataId = props.item.metadata_id
  const form = useForm({
    resolver: zodResolver(modelFormSchema),
    defaultValues: newModelDefaults(props.item.model_name),
  })
  const detail = useQuery({
    queryKey: modelsQueryKeys.detail(metadataId),
    queryFn: async () => {
      const response = await getModel(metadataId)
      if (!response.success || !response.data) {
        throw createServerError(response, t('Failed to load model'))
      }
      return response.data
    },
    enabled: metadataId > 0,
  })

  useEffect(() => {
    if (metadataId > 0 && detail.data) {
      form.reset(transformModelToFormDefaults(detail.data))
    }
  }, [metadataId, detail.data, form])

  // A model without metadata starts from its prepared draft; the draft is
  // only a suggestion until the admin saves it.
  const applyDraft = (draft: OnboardingDraft) => {
    const options = { shouldDirty: true }
    if (draft.description) {
      form.setValue('description', draft.description, options)
    }
    if (draft.icon) form.setValue('icon', draft.icon, options)
    const tags = (draft.tags ?? '').split(',').filter(Boolean)
    if (tags.length > 0) form.setValue('tags', tags, options)
    if (draft.vendor_id) form.setValue('vendor_id', draft.vendor_id, options)
  }
  const usesDraft = metadataId === 0 && !props.item.metadata_rule
  const draftApplied = useRef(false)
  useEffect(() => {
    if (!usesDraft || !props.item.draft || draftApplied.current) return
    draftApplied.current = true
    applyDraft(props.item.draft)
    // Applied once per opened model; later overview refreshes keep edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesDraft, props.item.draft])
  const redraft = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await draftOnboardingModel(props.item.model_name))
        .data,
    onSuccess: async (draft) => {
      if (!draft) return
      applyDraft(draft)
      await queryClient.invalidateQueries({
        queryKey: modelsQueryKeys.onboarding(),
      })
      toast.success(t('Draft prepared. Review and save.'))
    },
  })

  const dirty = form.formState.isDirty
  const { onDirtyChange } = props
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const official = useMutation({
    mutationFn: async () => {
      const previews = await Promise.all(
        OFFICIAL_LOCALES.map((locale) =>
          queryClient.fetchQuery({
            queryKey: [...modelsQueryKeys.all, 'official-metadata', locale],
            queryFn: async () =>
              requireServerSuccess(await previewUpstreamDiff({ locale })).data,
            staleTime: 10 * 60 * 1000,
          })
        )
      )
      const found = previews.map((preview, index) => ({
        locale: OFFICIAL_LOCALES[index],
        upstream: preview?.candidates.find(
          (candidate) => candidate.model_name === props.item.model_name
        )?.upstream,
      }))
      const primary = found.find((entry) => entry.upstream)?.upstream
      if (!primary) return null
      return officialMetadataValues(
        primary,
        joinDescriptions(
          found.map((entry) => ({
            locale: entry.locale,
            text: entry.upstream?.description ?? '',
          }))
        ),
        props.vendors
      )
    },
    onSuccess: (values) => {
      if (!values) {
        toast.info(t('This model is not in the official metadata catalog'))
        return
      }
      const options = { shouldDirty: true }
      if (values.description) {
        form.setValue('description', values.description, options)
      }
      if (values.icon) form.setValue('icon', values.icon, options)
      if (values.tags.length > 0) form.setValue('tags', values.tags, options)
      if (values.vendorId) form.setValue('vendor_id', values.vendorId, options)
      toast.success(t('Filled from official metadata. Review and save.'))
    },
  })

  const supplierDescription = useMutation({
    mutationFn: async () =>
      requireServerSuccess(
        await fetchSupplierDescription(props.item.model_name)
      ).data,
    onSuccess: (found) => {
      if (!found?.description) {
        toast.info(t('The supplier has no description for this model'))
        return
      }
      form.setValue('description', found.description, { shouldDirty: true })
      toast.success(
        t(
          'Description replaced with the one from {{channel}}. Review and save.',
          {
            channel: found.channel_name,
          }
        )
      )
      if (found.mentions_price) {
        toast.warning(
          t(
            'The supplier description mentions a price. Remove it before saving.'
          )
        )
      }
    },
  })

  const save = useMutation({
    mutationFn: async (values: ModelFormValues) => {
      const payload = transformFormDataToModelPayload(values)
      const response =
        metadataId > 0
          ? await updateModel({ ...payload, id: metadataId })
          : await createModel(payload)
      if (!response.success) {
        throw createServerError(response, t('Operation failed'))
      }
    },
    onSuccess: async () => {
      form.reset(form.getValues())
      await props.onSaved()
      toast.success(t('Model metadata saved'))
    },
  })

  const saveForGoLive = async () => {
    if (!form.formState.isDirty) return
    let invalid = false
    await form.handleSubmit(
      (values) => save.mutateAsync(values),
      () => {
        invalid = true
      }
    )()
    if (invalid) throw new Error(t('Fix the description and icon fields first'))
  }
  const saveRef = useRef(saveForGoLive)
  saveRef.current = saveForGoLive
  const { onRegisterSave } = props
  useEffect(() => {
    onRegisterSave?.(() => saveRef.current())
    return () => onRegisterSave?.(null)
  }, [onRegisterSave])

  let body = (
    <Form {...form}>
      <form
        className='space-y-4'
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        {props.item.metadata_rule && metadataId === 0 && (
          <Alert>
            <AlertDescription>
              {t(
                'Covered by the metadata rule "{{rule}}". Saving here creates a separate record for this model.',
                { rule: props.item.metadata_rule }
              )}
            </AlertDescription>
          </Alert>
        )}
        {usesDraft && props.item.draft && (
          <DraftNote draft={props.item.draft} />
        )}
        <ModelMetadataFields
          form={form}
          vendors={props.vendors}
          iconKey={props.item.model_name}
          tagSuggestions={props.tags}
          descriptionRows={5}
          descriptionAction={
            <Button
              type='button'
              variant='outline'
              size='xs'
              disabled={supplierDescription.isPending}
              onClick={() => supplierDescription.mutate()}
            >
              <CloudDownload aria-hidden className='size-3' />
              {supplierDescription.isPending
                ? t('Loading...')
                : t('Fetch supplier description')}
            </Button>
          }
        />
        <div className='flex justify-end'>
          <Button type='submit' disabled={save.isPending || !dirty}>
            {save.isPending ? t('Saving...') : t('Save metadata')}
          </Button>
        </div>
      </form>
    </Form>
  )
  if (metadataId > 0 && detail.isError) {
    body = (
      <ErrorState
        description={detail.error.message}
        onRetry={() => void detail.refetch()}
      />
    )
  } else if (metadataId > 0 && detail.isPending) {
    body = <LoadingState />
  }

  return (
    <TitledCard
      title={t('Description and icon')}
      description={t(
        'Prefill from the official catalog, then polish the copy before saving.'
      )}
      action={
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={redraft.isPending}
            onClick={() => redraft.mutate()}
          >
            <RefreshCw aria-hidden className='size-4' />
            {redraft.isPending ? t('Drafting...') : t('Draft again')}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={official.isPending}
            onClick={() => official.mutate()}
          >
            <Sparkles aria-hidden className='size-4' />
            {official.isPending ? t('Loading...') : t('Fill from official')}
          </Button>
        </div>
      }
    >
      {body}
    </TitledCard>
  )
}

function DraftNote(props: { draft: OnboardingDraft }) {
  const { t } = useTranslation()
  let text = t(
    'Filled from a template draft. Set up a description writer to get all seven languages.'
  )
  if (props.draft.polished) {
    text = t(
      'Filled from a draft written by the description writer. Review it before saving.'
    )
  } else if (props.draft.error) {
    text = t(props.draft.error)
  }
  return (
    <Alert>
      <AlertDescription>
        {text}
        {props.draft.based_on &&
          ` ${t('Icon, tags and vendor follow {{model}}.', {
            model: props.draft.based_on,
          })}`}
      </AlertDescription>
    </Alert>
  )
}
