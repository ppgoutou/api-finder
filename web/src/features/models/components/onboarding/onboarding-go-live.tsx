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
import { useMutation } from '@tanstack/react-query'
import { Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import {
  useCanEditModelPricing,
  useModelPricing,
} from '@/features/model-pricing/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { applyChannelUpstreamModels, applyUpstreamPrice } from '../../api'
import { hasEffectivePricing } from '../../lib/onboarding'
import type { OnboardingModel, UpstreamModelPrice } from '../../types'

/** Saves the cards that hold unsaved edits, before the model goes live. */
export type GoLiveSavers = {
  metadata?: () => Promise<void>
  category?: () => Promise<void>
}

type Step = { label: string; done: boolean; blocker?: string }

/**
 * The admin's part of putting a model on sale: one checklist and one button.
 * The button saves the description and category cards, adds the model to
 * every channel whose plugin serves it, and takes the supplier price when
 * the model has none.
 */
export function OnboardingGoLiveCard(props: {
  item: OnboardingModel
  upstreamPrice: UpstreamModelPrice | undefined
  metadataDirty: boolean
  categoryChosen: boolean
  savers: { current: GoLiveSavers }
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const canEditPricing = useCanEditModelPricing()
  const pricing = useModelPricing([props.item.model_name], canEditPricing)
  const entry = pricing.data?.entries.find(
    (item) => item.model_name === props.item.model_name
  )
  const priced = entry ? hasEffectivePricing(entry) : false
  const supplierPrice =
    props.upstreamPrice?.pricing && !props.upstreamPrice.error
      ? props.upstreamPrice
      : undefined
  const addable = props.item.pending_channels.filter(
    (channel) => !channel.plugin_missing
  )
  const serving = props.item.channels.length > 0

  const steps: Step[] = [
    {
      label: t('Channels'),
      done: serving && addable.length === 0,
      blocker:
        serving || addable.length > 0
          ? undefined
          : t('No channel can serve it yet'),
    },
    {
      label: t('Description and icon'),
      done: props.item.metadata_id > 0 && !props.metadataDirty,
      blocker:
        props.item.metadata_id > 0 || props.metadataDirty
          ? undefined
          : t('Write the description first'),
    },
    {
      label: t('Category'),
      done: props.categoryChosen,
      blocker: props.categoryChosen ? undefined : t('Pick a category'),
    },
    {
      label: t('Pricing'),
      done: priced,
      blocker: priced || supplierPrice ? undefined : t('No supplier price yet'),
    },
  ]
  const blockers = steps.flatMap((step) => (step.blocker ? [step.blocker] : []))
  const live = steps.every((step) => step.done)

  const goLive = useMutation({
    mutationFn: async () => {
      await props.savers.current.metadata?.()
      await props.savers.current.category?.()
      for (const channel of addable) {
        const response = await applyChannelUpstreamModels({
          id: channel.id,
          add_models: [props.item.model_name],
        })
        if (!response.success) {
          throw createServerError(
            response,
            t('Failed to update channel {{name}}', { name: channel.name })
          )
        }
      }
      if (!priced && supplierPrice) {
        requireServerSuccess(
          await applyUpstreamPrice({ model_name: props.item.model_name })
        )
      }
    },
    onSettled: () => props.onChanged(),
    onSuccess: () => {
      toast.success(t('{{name}} is on sale', { name: props.item.model_name }))
    },
  })

  return (
    <TitledCard
      title={t('Go live')}
      description={t(
        'Check the items below, then put the model on sale in one step.'
      )}
      icon={<Rocket aria-hidden className='size-4' />}
      action={
        <Button
          size='sm'
          disabled={goLive.isPending || blockers.length > 0 || live}
          onClick={() => goLive.mutate()}
        >
          {goLive.isPending ? t('Saving...') : t('Confirm and go live')}
        </Button>
      }
    >
      <ul className='flex flex-wrap gap-2'>
        {steps.map((step) => {
          let variant: 'success' | 'warning' | 'neutral' = 'neutral'
          if (step.done) variant = 'success'
          else if (step.blocker) variant = 'warning'
          return (
            <li key={step.label}>
              <StatusBadge
                size='sm'
                variant={variant}
                label={step.label}
                copyable={false}
              />
            </li>
          )
        })}
      </ul>
      {blockers.length > 0 && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {blockers.join(' · ')}
        </p>
      )}
      {live && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t('This model is on sale.')}
        </p>
      )}
    </TitledCard>
  )
}
