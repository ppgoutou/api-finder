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
import { Check } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { GroupBadge } from '@/components/group-badge'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { TitledCard } from '@/components/ui/titled-card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  modelBadgeLabel,
  PRICING_MODEL_BADGES,
} from '@/features/pricing/lib/categories'
import type {
  PricingCategory,
  PricingModelBadge,
} from '@/features/pricing/types'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { applyChannelUpstreamModels } from '../../api'
import { assignModelCategory, channelGroups } from '../../lib/onboarding'
import { PRESSED_BADGE_CLASSES } from '../../lib/pricing-categories'
import type {
  OnboardingChannel,
  OnboardingModel,
  UpstreamModelPrice,
  Vendor,
} from '../../types'
import { OnboardingGoLiveCard, type GoLiveSavers } from './onboarding-go-live'
import { OnboardingMetadataCard } from './onboarding-metadata-card'
import { OnboardingPriceCard } from './onboarding-price-card'

const NO_CATEGORY = '__none__'

export function OnboardingEditor(props: {
  item: OnboardingModel
  vendors: Vendor[]
  tags: string[]
  categories: PricingCategory[]
  onSaveCategories: (next: PricingCategory[]) => Promise<void>
  onChanged: () => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  upstreamPrice: UpstreamModelPrice | undefined
  applyingUpstreamPrice: boolean
  onApplyUpstreamPrice: () => void
  acknowledgingUpstreamPrice: boolean
  onAcknowledgeUpstreamPrice: () => void
}) {
  const { t } = useTranslation()
  const savers = useRef<GoLiveSavers>({})
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [categoryChosen, setCategoryChosen] = useState(() =>
    props.categories.some((category) =>
      category.models.includes(props.item.model_name)
    )
  )
  const { onDirtyChange } = props
  const handleMetadataDirty = useCallback(
    (dirty: boolean) => {
      setMetadataDirty(dirty)
      onDirtyChange(dirty)
    },
    [onDirtyChange]
  )
  const registerMetadataSave = useCallback(
    (save: (() => Promise<void>) | null) => {
      savers.current.metadata = save ?? undefined
    },
    []
  )
  const registerCategorySave = useCallback(
    (save: (() => Promise<void>) | null) => {
      savers.current.category = save ?? undefined
    },
    []
  )
  const channelWork =
    props.item.channels.length === 0 ||
    props.item.pending_channels.length > 0 ||
    props.item.removed_channels.length > 0

  return (
    <div className='space-y-4 pb-4 lg:min-h-0 lg:overflow-auto'>
      <div>
        <h2 className='font-mono text-lg font-semibold break-all'>
          {props.item.model_name}
        </h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Each card saves on its own. Work top to bottom to put the model on sale.'
          )}
        </p>
      </div>
      <OnboardingGoLiveCard
        item={props.item}
        upstreamPrice={props.upstreamPrice}
        metadataDirty={metadataDirty}
        categoryChosen={categoryChosen}
        savers={savers}
        onChanged={props.onChanged}
      />
      {channelWork && (
        <OnboardingChannelsCard item={props.item} onChanged={props.onChanged} />
      )}
      <OnboardingMetadataCard
        item={props.item}
        vendors={props.vendors}
        tags={props.tags}
        onDirtyChange={handleMetadataDirty}
        onSaved={props.onChanged}
        onRegisterSave={registerMetadataSave}
      />
      <OnboardingCategoryCard
        modelName={props.item.model_name}
        categories={props.categories}
        onSave={props.onSaveCategories}
        onRegisterSave={registerCategorySave}
        onChosenChange={setCategoryChosen}
      />
      <OnboardingPriceCard
        modelName={props.item.model_name}
        upstream={props.upstreamPrice}
        applying={props.applyingUpstreamPrice}
        onApply={props.onApplyUpstreamPrice}
        acknowledging={props.acknowledgingUpstreamPrice}
        onAcknowledge={props.onAcknowledgeUpstreamPrice}
      />
    </div>
  )
}

type ChannelAction = 'add' | 'ignore' | 'remove'

function OnboardingChannelsCard(props: {
  item: OnboardingModel
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const pending = props.item.pending_channels
  const removed = props.item.removed_channels
  // A channel whose plugin does not list the model would fail every call, so
  // it is left for the admin to pick after updating the plugin.
  const [selectedPending, setSelectedPending] = useState<Set<number>>(
    () =>
      new Set(
        pending
          .filter((channel) => !channel.plugin_missing)
          .map((channel) => channel.id)
      )
  )
  const [selectedRemoved, setSelectedRemoved] = useState<Set<number>>(
    () => new Set(removed.map((channel) => channel.id))
  )
  const [confirmRemove, setConfirmRemove] = useState(false)
  const chosenPending = pending.filter((channel) =>
    selectedPending.has(channel.id)
  )
  const chosenRemoved = removed.filter((channel) =>
    selectedRemoved.has(channel.id)
  )

  const apply = useMutation({
    mutationFn: async (action: ChannelAction) => {
      const name = props.item.model_name
      const targets = action === 'remove' ? chosenRemoved : chosenPending
      for (const channel of targets) {
        let request: Parameters<typeof applyChannelUpstreamModels>[0] = {
          id: channel.id,
          add_models: [name],
        }
        if (action === 'ignore') {
          request = { id: channel.id, ignore_models: [name] }
        } else if (action === 'remove') {
          request = { id: channel.id, remove_models: [name] }
        }
        const response = await applyChannelUpstreamModels(request)
        if (!response.success) {
          throw createServerError(
            response,
            t('Failed to update channel {{name}}', { name: channel.name })
          )
        }
      }
      return { action, count: targets.length }
    },
    onSettled: () => props.onChanged(),
    onSuccess: (result) => {
      if (result.action === 'add') {
        toast.success(t('Added to {{count}} channels', { count: result.count }))
      } else if (result.action === 'ignore') {
        toast.success(
          t('Ignored on {{count}} channels', { count: result.count })
        )
      } else {
        toast.success(
          t('Removed from {{count}} channels', { count: result.count })
        )
      }
    },
  })

  return (
    <TitledCard
      title={t('Channels and groups')}
      description={t(
        'Groups come from the channels serving the model. Change a channel to change its groups.'
      )}
    >
      <div className='space-y-4'>
        <section className='space-y-2'>
          <h3 className='text-sm font-medium'>{t('Serving now')}</h3>
          {props.item.channels.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('No channel serves this model yet.')}
            </p>
          ) : (
            <ChannelRows channels={props.item.channels} />
          )}
        </section>
        {removed.length > 0 && (
          <section className='space-y-2'>
            <h3 className='text-destructive text-sm font-medium'>
              {t('Delisted upstream')}
            </h3>
            <p className='text-muted-foreground text-xs'>
              {t(
                'These channels still list the model, but their upstream no longer offers it. Calls through them will fail.'
              )}
            </p>
            <ChannelChecklist
              channels={removed}
              selected={selectedRemoved}
              onSelectedChange={setSelectedRemoved}
            />
            <div className='flex justify-end'>
              <Button
                type='button'
                variant='destructive'
                size='sm'
                disabled={apply.isPending || chosenRemoved.length === 0}
                onClick={() => setConfirmRemove(true)}
              >
                {t('Remove from selected channels')}
              </Button>
            </div>
          </section>
        )}
        {pending.length > 0 && (
          <section className='space-y-2'>
            <h3 className='text-sm font-medium'>{t('Offered by upstream')}</h3>
            {pending.some((channel) => channel.plugin_missing) && (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'The plugin of a marked channel does not support this model yet. Each upstream price check adapts the plugin from the supplier prices when it can.'
                )}
              </p>
            )}
            <ChannelChecklist
              channels={pending}
              selected={selectedPending}
              onSelectedChange={setSelectedPending}
            />
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={apply.isPending || chosenPending.length === 0}
                onClick={() => apply.mutate('ignore')}
              >
                {t('Ignore')}
              </Button>
              <Button
                type='button'
                size='sm'
                disabled={apply.isPending || chosenPending.length === 0}
                onClick={() => apply.mutate('add')}
              >
                {t('Add to selected channels')}
              </Button>
            </div>
          </section>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        destructive
        title={t('Remove {{name}} from {{count}} channels?', {
          name: props.item.model_name,
          count: chosenRemoved.length,
        })}
        desc={t(
          'The channels stop serving this model. Metadata, price and category stay.'
        )}
        confirmText={t('Remove')}
        handleConfirm={() => {
          setConfirmRemove(false)
          apply.mutate('remove')
        }}
      />
    </TitledCard>
  )
}

function ChannelChecklist(props: {
  channels: OnboardingChannel[]
  selected: Set<number>
  onSelectedChange: (selected: Set<number>) => void
}) {
  return (
    <ul className='space-y-2'>
      {props.channels.map((channel) => (
        <li key={channel.id}>
          <label className='flex items-start gap-2'>
            <Checkbox
              className='mt-0.5'
              checked={props.selected.has(channel.id)}
              onCheckedChange={(value) => {
                const next = new Set(props.selected)
                if (value) next.add(channel.id)
                else next.delete(channel.id)
                props.onSelectedChange(next)
              }}
            />
            <ChannelLabel channel={channel} />
          </label>
        </li>
      ))}
    </ul>
  )
}

function ChannelRows(props: { channels: OnboardingChannel[] }) {
  return (
    <ul className='space-y-2'>
      {props.channels.map((channel) => (
        <li key={channel.id}>
          <ChannelLabel channel={channel} />
        </li>
      ))}
    </ul>
  )
}

function ChannelLabel(props: { channel: OnboardingChannel }) {
  const { t } = useTranslation()
  return (
    <span className='flex min-w-0 flex-wrap items-center gap-1.5 text-sm'>
      <span className='truncate'>{props.channel.name}</span>
      <span className='text-muted-foreground text-xs'>#{props.channel.id}</span>
      {channelGroups([props.channel]).map((group) => (
        <GroupBadge key={group} group={group} size='sm' />
      ))}
      {props.channel.plugin_missing && (
        <StatusBadge
          variant='warning'
          label={t('Plugin update needed')}
          copyable={false}
        />
      )}
      {props.channel.plugin_adaptation?.adapted && (
        <StatusBadge
          variant='success'
          label={t('Plugin adapted automatically')}
          copyable={false}
        />
      )}
      <PluginAdaptationNote channel={props.channel} />
    </span>
  )
}

function PluginAdaptationNote(props: { channel: OnboardingChannel }) {
  const { t } = useTranslation()
  const adaptation = props.channel.plugin_adaptation
  if (!adaptation) return null
  let note = ''
  if (!adaptation.adapted && adaptation.error) {
    note = t(adaptation.error)
  } else if (adaptation.based_on) {
    note = t(
      'Resolutions and billing follow the supplier; durations and ratios follow {{model}}. Check them before going live.',
      { model: adaptation.based_on }
    )
  }
  if (!note) return null
  return <span className='text-muted-foreground w-full text-xs'>{note}</span>
}

function OnboardingCategoryCard(props: {
  modelName: string
  categories: PricingCategory[]
  onSave: (next: PricingCategory[]) => Promise<void>
  onRegisterSave: (save: (() => Promise<void>) | null) => void
  onChosenChange: (chosen: boolean) => void
}) {
  const { t } = useTranslation()
  const owner = props.categories.find((category) =>
    category.models.includes(props.modelName)
  )
  const [categoryId, setCategoryId] = useState(owner?.id ?? NO_CATEGORY)
  const [badges, setBadges] = useState<PricingModelBadge[]>(
    owner?.badges?.[props.modelName] ?? []
  )
  const save = useMutation({
    mutationFn: () =>
      props.onSave(
        assignModelCategory(
          props.categories,
          props.modelName,
          categoryId === NO_CATEGORY ? null : categoryId,
          categoryId === NO_CATEGORY ? [] : badges
        )
      ),
  })

  const savedBadges = owner?.badges?.[props.modelName] ?? []
  const categoryDirty =
    categoryId !== (owner?.id ?? NO_CATEGORY) ||
    badges.join(',') !== savedBadges.join(',')
  const saveRef = useRef(async () => {})
  saveRef.current = async () => {
    if (categoryDirty) await save.mutateAsync()
  }
  const { onRegisterSave, onChosenChange } = props
  useEffect(() => {
    onRegisterSave(() => saveRef.current())
    return () => onRegisterSave(null)
  }, [onRegisterSave])
  const chosen = categoryId !== NO_CATEGORY
  useEffect(() => onChosenChange(chosen), [chosen, onChosenChange])

  return (
    <TitledCard
      title={t('Category and badges')}
      description={t('Where the model shows on the pricing page.')}
    >
      {props.categories.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t('No categories yet. Create one in the Categories tab.')}
        </p>
      ) : (
        <div className='space-y-3'>
          <Combobox
            options={[
              { value: NO_CATEGORY, label: t('No category') },
              ...props.categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
            value={categoryId}
            onValueChange={(value) => setCategoryId(value ?? NO_CATEGORY)}
            aria-label={t('Category')}
            className='w-full'
          />
          <ToggleGroup
            multiple
            variant='outline'
            size='sm'
            spacing={1}
            aria-label={t('Badges for {{name}}', { name: props.modelName })}
            disabled={categoryId === NO_CATEGORY}
            value={badges}
            onValueChange={(value) =>
              setBadges(
                PRICING_MODEL_BADGES.filter((badge) => value.includes(badge))
              )
            }
          >
            {PRICING_MODEL_BADGES.map((badge) => (
              <ToggleGroupItem
                key={badge}
                value={badge}
                className={cn(
                  'h-7 px-2 text-xs font-semibold',
                  PRESSED_BADGE_CLASSES[badge]
                )}
              >
                <Check
                  aria-hidden
                  className='hidden size-3 group-aria-pressed/toggle:block'
                />
                {modelBadgeLabel(badge, t)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className='flex justify-end'>
            <Button
              type='button'
              size='sm'
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t('Saving...') : t('Save category')}
            </Button>
          </div>
        </div>
      )}
    </TitledCard>
  )
}
