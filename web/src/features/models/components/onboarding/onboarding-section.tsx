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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Eye,
  EyeOff,
  History,
  PenLine,
  RefreshCw,
  ScanSearch,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  useCanEditModelPricing,
  useModelPricing,
} from '@/features/model-pricing/api'
import type { PricingCategory } from '@/features/pricing/types'
import { updateSystemOption } from '@/features/system-settings/api'
import { useSystemOptions } from '@/features/system-settings/hooks/use-system-options'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  acknowledgeUpstreamPrices,
  applyChannelUpstreamModels,
  applyUpstreamPrice,
  getModelOnboarding,
  getUpstreamPrices,
  getVendors,
  setOnboardingIgnored,
  setUpstreamPricingToken,
} from '../../api'
import { useOnboardingSync } from '../../hooks/use-onboarding-sync'
import { modelsQueryKeys, vendorsQueryKeys } from '../../lib'
import {
  hasEffectivePricing,
  matchesOnboardingFilter,
  onboardingStatus,
  type OnboardingFilter,
} from '../../lib/onboarding'
import {
  parsePricingCategories,
  PRICING_CATEGORIES_OPTION_KEY,
  pricingCategoryOwners,
} from '../../lib/pricing-categories'
import { OnboardingEditor } from './onboarding-editor'
import { OnboardingList, type OnboardingRow } from './onboarding-list'
import {
  DescriptionLLMDialog,
  OnboardingSyncHistoryDialog,
} from './onboarding-sync'
import {
  UpstreamPricePanel,
  type AcknowledgeRequest,
} from './onboarding-upstream-prices'

export function OnboardingSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<OnboardingFilter>('todo')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [editorDirty, setEditorDirty] = useState(false)
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [writerOpen, setWriterOpen] = useState(false)

  const overview = useQuery({
    queryKey: modelsQueryKeys.onboarding(),
    queryFn: async () => requireServerSuccess(await getModelOnboarding()).data,
  })
  const canEditPricing = useCanEditModelPricing()
  const pricing = useModelPricing([], canEditPricing)
  const options = useSystemOptions()
  const upstreamPrices = useQuery({
    queryKey: modelsQueryKeys.upstreamPrices(),
    queryFn: async () => requireServerSuccess(await getUpstreamPrices()).data,
    enabled: canEditPricing,
  })
  const vendors = useQuery({
    queryKey: vendorsQueryKeys.list(),
    queryFn: async () =>
      requireServerSuccess(await getVendors({ page_size: 1000 })),
  })

  const categories = useMemo(
    () =>
      parsePricingCategories(
        options.data?.data.find(
          (option) => option.key === PRICING_CATEGORIES_OPTION_KEY
        )?.value
      ),
    [options.data]
  )
  const priced = useMemo(() => {
    if (!pricing.data) return undefined
    return new Set(
      pricing.data.entries
        .filter(hasEffectivePricing)
        .map((entry) => entry.model_name)
    )
  }, [pricing.data])

  const priceChanges = useMemo(
    () =>
      (upstreamPrices.data?.changes ?? []).filter(
        (change) => change.kind !== 'group_ratio'
      ),
    [upstreamPrices.data]
  )
  const allRows = useMemo<OnboardingRow[]>(() => {
    const owners = pricingCategoryOwners(categories)
    const repriced = new Set(priceChanges.map((change) => change.model_name))
    return (overview.data?.items ?? []).map((item) => ({
      item,
      status: onboardingStatus(item, priced, owners, repriced),
    }))
  }, [overview.data, priced, categories, priceChanges])
  const workbenchModels = useMemo(
    () => new Set(allRows.map((row) => row.item.model_name)),
    [allRows]
  )

  const counts = useMemo(() => {
    const result: Record<OnboardingFilter, number> = {
      todo: 0,
      pending: 0,
      removed: 0,
      priced: 0,
      ignored: 0,
      all: 0,
    }
    for (const row of allRows) {
      for (const key of Object.keys(result) as OnboardingFilter[]) {
        if (matchesOnboardingFilter(row.status, key)) result[key]++
      }
    }
    return result
  }, [allRows])

  const keyword = search.trim().toLowerCase()
  const rows = allRows.filter(
    (row) =>
      matchesOnboardingFilter(row.status, filter) &&
      (!keyword || row.item.model_name.toLowerCase().includes(keyword))
  )
  const current = allRows.find((row) => row.item.model_name === selected)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: modelsQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['model-pricing-config'] }),
      queryClient.invalidateQueries({ queryKey: ['pricing'] }),
    ])
  }

  const saveCategories = async (next: PricingCategory[]) => {
    const response = await updateSystemOption({
      key: PRICING_CATEGORIES_OPTION_KEY,
      value: next.length > 0 ? JSON.stringify(next) : '',
    })
    if (!response.success) {
      throw createServerError(response, t('Failed to save categories'))
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['system-options'] }),
      queryClient.invalidateQueries({ queryKey: ['pricing'] }),
    ])
    toast.success(t('Categories saved'))
  }

  const acknowledge = useMutation({
    mutationFn: async (request: AcknowledgeRequest) =>
      requireServerSuccess(await acknowledgeUpstreamPrices(request)).data,
    onSuccess: (report) =>
      queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report),
  })

  const applyPrice = useMutation({
    mutationFn: async (modelName: string) =>
      requireServerSuccess(await applyUpstreamPrice({ model_name: modelName }))
        .data,
    onSuccess: async (report) => {
      queryClient.setQueryData(modelsQueryKeys.upstreamPrices(), report)
      await refresh()
      toast.success(t('Model pricing saved'))
    },
  })

  const saveUpstreamToken = async (channelId: number, token: string) => {
    const response = await setUpstreamPricingToken({
      channel_id: channelId,
      token,
    })
    if (!response.success) {
      throw createServerError(response, t('Operation failed'))
    }
    await queryClient.invalidateQueries({
      queryKey: modelsQueryKeys.upstreamPrices(),
    })
    toast.success(
      token ? t('Supplier token saved') : t('Supplier token cleared')
    )
  }

  const batchAdd = useMutation({
    mutationFn: async () => {
      const byChannel = new Map<number, string[]>()
      for (const row of allRows) {
        if (!checked.has(row.item.model_name)) continue
        for (const channel of row.item.pending_channels) {
          byChannel.set(channel.id, [
            ...(byChannel.get(channel.id) ?? []),
            row.item.model_name,
          ])
        }
      }
      for (const [id, names] of byChannel) {
        const response = await applyChannelUpstreamModels({
          id,
          add_models: names,
        })
        if (!response.success) {
          throw createServerError(response, t('Operation failed'))
        }
      }
      return byChannel.size
    },
    onSettled: refresh,
    onSuccess: (channelCount) => {
      setChecked(new Set())
      toast.success(t('Added to {{count}} channels', { count: channelCount }))
    },
  })

  const changeIgnored = useMutation({
    mutationFn: async (request: { names: string[]; ignored: boolean }) => {
      requireServerSuccess(
        await setOnboardingIgnored({
          model_names: request.names,
          ignored: request.ignored,
        })
      )
      return request
    },
    onSettled: refresh,
    onSuccess: (request) => {
      setChecked(new Set())
      const count = request.names.length
      toast.success(
        request.ignored
          ? t('Ignored {{count}} models', { count })
          : t('Restored {{count}} models', { count })
      )
    },
  })

  const sync = useOnboardingSync(refresh)

  const select = (name: string) => {
    if (name === selected) return
    if (editorDirty) {
      setPendingSelect(name)
      return
    }
    setSelected(name)
  }

  if (overview.isError) {
    return (
      <ErrorState
        description={overview.error.message}
        onRetry={() => void overview.refetch()}
      />
    )
  }
  if (overview.isPending) return <LoadingState />

  const checkedPending = allRows.some(
    (row) => checked.has(row.item.model_name) && row.status.pending
  )
  const checkedByIgnored = (ignored: boolean) =>
    allRows
      .filter(
        (row) =>
          checked.has(row.item.model_name) && row.status.ignored === ignored
      )
      .map((row) => row.item.model_name)
  const checkedToIgnore = checkedByIgnored(false)
  const checkedToRestore = checkedByIgnored(true)

  return (
    <div className='flex h-full min-h-0 flex-col gap-3 overflow-auto lg:overflow-hidden'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Pick a model to write its description, icon and category. Prices follow the upstream.'
          )}
        </p>
        <div className='flex flex-wrap gap-2'>
          {checked.size > 0 && (
            <Button
              size='sm'
              disabled={!checkedPending || batchAdd.isPending}
              onClick={() => batchAdd.mutate()}
            >
              {t('Add {{count}} selected to their channels', {
                count: checked.size,
              })}
            </Button>
          )}
          {checkedToIgnore.length > 0 && (
            <Button
              size='sm'
              variant='outline'
              disabled={changeIgnored.isPending}
              onClick={() =>
                changeIgnored.mutate({ names: checkedToIgnore, ignored: true })
              }
            >
              <EyeOff aria-hidden className='size-4' />
              {t('Ignore {{count}} selected', {
                count: checkedToIgnore.length,
              })}
            </Button>
          )}
          {checkedToRestore.length > 0 && (
            <Button
              size='sm'
              variant='outline'
              disabled={changeIgnored.isPending}
              onClick={() =>
                changeIgnored.mutate({
                  names: checkedToRestore,
                  ignored: false,
                })
              }
            >
              <Eye aria-hidden className='size-4' />
              {t('Restore {{count}} selected', {
                count: checkedToRestore.length,
              })}
            </Button>
          )}
          <Button size='sm' disabled={sync.running} onClick={sync.start}>
            <ScanSearch aria-hidden className='size-4' />
            {sync.running
              ? t('Syncing... {{progress}}%', { progress: sync.progress ?? 0 })
              : t('Sync upstream')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setHistoryOpen(true)}
          >
            <History aria-hidden className='size-4' />
            {t('Sync history')}
          </Button>
          {canEditPricing && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setWriterOpen(true)}
            >
              <PenLine aria-hidden className='size-4' />
              {t('Description writer')}
            </Button>
          )}
          <Button
            size='sm'
            variant='outline'
            aria-label={t('Refresh')}
            disabled={overview.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden className='size-4' />
            {t('Refresh')}
          </Button>
        </div>
      </div>
      {canEditPricing && (
        <UpstreamPricePanel
          report={upstreamPrices.data}
          workbenchModels={workbenchModels}
          acknowledging={acknowledge.isPending}
          onAcknowledge={(request) => acknowledge.mutate(request)}
          onSaveToken={saveUpstreamToken}
        />
      )}
      <div className='grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]'>
        <OnboardingList
          rows={rows}
          counts={counts}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          selected={selected}
          onSelect={select}
          checked={checked}
          onCheckedChange={setChecked}
        />
        {current ? (
          <OnboardingEditor
            key={current.item.model_name}
            item={current.item}
            vendors={vendors.data?.data?.items ?? []}
            tags={overview.data?.tags ?? []}
            categories={categories}
            onSaveCategories={saveCategories}
            onChanged={refresh}
            onDirtyChange={setEditorDirty}
            changingIgnored={changeIgnored.isPending}
            onToggleIgnored={() =>
              changeIgnored.mutate({
                names: [current.item.model_name],
                ignored: !current.status.ignored,
              })
            }
            upstreamPrice={
              upstreamPrices.data?.models?.[current.item.model_name]
            }
            applyingUpstreamPrice={applyPrice.isPending}
            onApplyUpstreamPrice={() =>
              applyPrice.mutate(current.item.model_name)
            }
            acknowledgingUpstreamPrice={acknowledge.isPending}
            onAcknowledgeUpstreamPrice={() =>
              acknowledge.mutate({ model_names: [current.item.model_name] })
            }
          />
        ) : (
          <EmptyState
            bordered
            title={t('Select a model')}
            description={t(
              'Its description, icon, category and price open here.'
            )}
          />
        )}
      </div>
      <OnboardingSyncHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
      <DescriptionLLMDialog open={writerOpen} onOpenChange={setWriterOpen} />
      <ConfirmDialog
        open={pendingSelect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSelect(null)
        }}
        title={t('Discard unsaved changes?')}
        desc={t('Your changes have not been saved.')}
        confirmText={t('Discard changes')}
        handleConfirm={() => {
          setEditorDirty(false)
          setSelected(pendingSelect)
          setPendingSelect(null)
        }}
      />
    </div>
  )
}
