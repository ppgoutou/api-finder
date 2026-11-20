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
import { useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { MembershipPriceCard, useMembership } from '@/features/membership'
import type { StudioKind } from '@/features/video-studio/types'
import { cn } from '@/lib/utils'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  CategoryComparison,
  ModelCardGrid,
  ModelDistribution,
  PricingHeroNote,
  PricingLiveStats,
} from './components'
import { VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'
import {
  groupModelsByCategory,
  modelBadgesByName,
  UNCATEGORIZED_CATEGORY,
  type PricingCategorySection,
} from './lib/categories'
import type { VipPriceContext } from './lib/vip-price'
import type { PricingModel } from './types'

// The drawer pulls in the VChart performance charts, so load it on first open.
const LazyModelDetailsDrawer = lazy(() =>
  import('./components/model-details').then((m) => ({
    default: m.ModelDetailsDrawer,
  }))
)

export function Pricing() {
  const { t } = useTranslation()
  const { data: membership } = useMembership()
  const showVipCard = Boolean(membership?.enabled)
  const vipPrice = useMemo((): VipPriceContext | undefined => {
    if (!membership?.enabled || !membership.vip_pairs?.length) return undefined
    return {
      pairs: membership.vip_pairs.map((pair) => ({
        baseGroup: pair.base_group,
        vipGroup: pair.vip_group,
        baseRatio: pair.base_ratio,
        vipRatio: pair.vip_ratio,
      })),
      viewerVipGroup: membership.vip_group ?? '',
      isVip: membership.is_vip === true,
    }
  }, [membership])
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    categories,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    categoryFilter,
    groupFilter,
    quotaTypeFilter,
    modelTypeFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setCategoryFilter,
    setQuotaTypeFilter,
    setModelTypeFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    clearFilters,
    clearSearch,
  } = useFilters(models || [], categories)

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const navigate = useNavigate()
  const handleModelTry = useCallback(
    (modelName: string, kind: StudioKind) =>
      navigate({ to: '/video-studio', search: { model: modelName, kind } }),
    [navigate]
  )

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const categorySections = useMemo(
    () => groupModelsByCategory(filteredModels, categories),
    [filteredModels, categories]
  )
  const modelBadges = useMemo(() => modelBadgesByName(categories), [categories])
  const distributionSections = useMemo(
    () => groupModelsByCategory(models || [], categories),
    [models, categories]
  )

  const renderModels = (sectionModels: PricingModel[]) => {
    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          models={sectionModels}
          onModelClick={handleModelClick}
          onModelTry={handleModelTry}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
          vip={vipPrice}
          badges={modelBadges}
        />
      )
    }

    return (
      <PricingTable
        models={sectionModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
      />
    )
  }

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (categorySections.length === 0) {
      return renderModels(filteredModels)
    }

    return (
      <div className='space-y-8'>
        {categorySections.map((section) => renderCategorySection(section))}
      </div>
    )
  }

  const renderCategorySection = (section: PricingCategorySection) => {
    const name =
      section.id === UNCATEGORIZED_CATEGORY ? t('Other models') : section.name
    return (
      <section
        key={section.id}
        aria-labelledby={`pricing-category-${section.id}`}
        className='space-y-3'
      >
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1'>
          <h2
            id={`pricing-category-${section.id}`}
            className='text-foreground text-lg font-semibold'
          >
            {name}
          </h2>
          <span className='text-muted-foreground text-xs'>
            {t('{{count}} models', { count: section.models.length })}
          </span>
          {(section.description || section.comparison) && (
            <div className='text-muted-foreground flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
              {section.description && <p>{section.description}</p>}
              {section.comparison && (
                <CategoryComparison
                  categoryName={name}
                  comparison={section.comparison}
                />
              )}
            </div>
          )}
        </div>
        {renderModels(section.models)}
      </section>
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-20 dark:opacity-[0.10]'
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
              'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
              'radial-gradient(ellipse 40% 35% at 50% 70%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
            ].join(', '),
            maskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 40%, transparent 100%)',
          }}
        />
        <PageTransition className='relative mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <header
            className={cn(
              'mx-auto mb-5 grid gap-6 pt-5 sm:mb-10 sm:pt-10',
              showVipCard
                ? 'max-w-6xl lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12'
                : 'max-w-3xl'
            )}
          >
            <div className='flex min-w-0 flex-col justify-center gap-4'>
              <span className='bg-card text-brand dark:text-brand-on-dark inline-flex h-7 items-center gap-2 self-start rounded-full border px-3 text-xs font-semibold'>
                <span aria-hidden className='bg-brand size-1.5 rounded-full' />
                {t('{{count}} models online', { count: models?.length || 0 })}
              </span>
              <h1 className='font-display text-heading-1'>
                {t('Model Square')}
              </h1>
              <PricingHeroNote
                models={models || []}
                className='mx-0 mt-0 items-start'
              />
              <PricingLiveStats />
              <SearchBar
                value={searchInput}
                onChange={setSearchInput}
                onClear={clearSearch}
                placeholder={t(
                  'Search model name, provider, endpoint, or tag...'
                )}
              />
              <ModelDistribution
                sections={distributionSections}
                className='mx-0 mt-0 max-w-none justify-start'
              />
            </div>
            <MembershipPriceCard info={membership} className='self-center' />
          </header>

          <div className='grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'>
            <PricingSidebar
              quotaTypeFilter={quotaTypeFilter}
              modelTypeFilter={modelTypeFilter}
              categoryFilter={categoryFilter}
              onQuotaTypeChange={setQuotaTypeFilter}
              onModelTypeChange={setModelTypeFilter}
              onCategoryChange={setCategoryFilter}
              categories={categories}
              models={models || []}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
              className='hover-scrollbar sticky top-20 hidden max-h-[calc(100dvh-6rem)] self-start overflow-y-auto xl:block'
            />

            <main className='min-w-0 space-y-4'>
              <PricingToolbar
                filteredCount={filteredModels.length}
                totalCount={models?.length}
                sortBy={sortBy}
                onSortChange={setSortBy}
                tokenUnit={tokenUnit}
                onTokenUnitChange={setTokenUnit}
                showRechargePrice={showRechargePrice}
                onRechargePriceChange={setShowRechargePrice}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                quotaTypeFilter={quotaTypeFilter}
                modelTypeFilter={modelTypeFilter}
                categoryFilter={categoryFilter}
                onQuotaTypeChange={setQuotaTypeFilter}
                onModelTypeChange={setModelTypeFilter}
                onCategoryChange={setCategoryFilter}
                categories={categories}
                models={models || []}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />

              {renderPricingContent()}
            </main>
          </div>

          {selectedModel && (
            <Suspense fallback={null}>
              <LazyModelDetailsDrawer
                open={Boolean(selectedModel)}
                onOpenChange={(open) => {
                  if (!open) setSelectedModelName(null)
                }}
                model={selectedModel}
                groupRatio={groupRatio || {}}
                usableGroup={usableGroup || {}}
                endpointMap={
                  (endpointMap as Record<
                    string,
                    { path?: string; method?: string }
                  >) || {}
                }
                autoGroups={autoGroups || []}
                priceRate={priceRate ?? 1}
                usdExchangeRate={usdExchangeRate ?? 1}
                tokenUnit={tokenUnit}
                showRechargePrice={showRechargePrice}
                selectedGroup={groupFilter}
                vip={vipPrice}
              />
            </Suspense>
          )}
        </PageTransition>
      </div>
    </PublicLayout>
  )
}
