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
import { useSearch } from '@tanstack/react-router'
import { useMemo, useCallback, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'

import {
  FILTER_ALL,
  SORT_OPTIONS,
  QUOTA_TYPES,
  MODEL_TYPES,
  DEFAULT_TOKEN_UNIT,
  VIEW_MODES,
  type ViewMode,
} from '../constants'
import { filterByCategory } from '../lib/categories'
import { filterAndSortModels } from '../lib/filters'
import type { PricingCategory, PricingModel, TokenUnit } from '../types'

type FilterState = {
  search?: string
  sort?: string
  vendor?: string
  category?: string
  group?: string
  quotaType?: string
  modelType?: string
  tag?: string
  tokenUnit?: TokenUnit
  view?: ViewMode
  rechargePrice?: boolean
}

function normalizeViewMode(value: unknown): ViewMode {
  if (value === VIEW_MODES.TABLE) {
    return VIEW_MODES.TABLE
  }
  return VIEW_MODES.CARD
}

export function useFilters(
  models: PricingModel[],
  categories: PricingCategory[] = []
) {
  const search = useSearch({ from: '/pricing/' })
  const [filterState, setFilterState] = useState<FilterState>(() => ({
    search: search.search,
    sort: search.sort,
    vendor: search.vendor,
    category: search.category,
    group: search.group,
    quotaType: search.quotaType,
    modelType: search.modelType,
    tag: search.tag,
    tokenUnit: search.tokenUnit,
    view: search.view,
    rechargePrice: search.rechargePrice,
  }))

  const searchInput = filterState.search || ''
  const debouncedSearchInput = useDebounce(searchInput, 200)
  const sortBy = filterState.sort || SORT_OPTIONS.NAME
  const vendorFilter = filterState.vendor || FILTER_ALL
  const categoryFilter = filterState.category || FILTER_ALL
  const groupFilter = filterState.group || FILTER_ALL
  const quotaTypeFilter = filterState.quotaType || QUOTA_TYPES.ALL
  const modelTypeFilter = filterState.modelType || MODEL_TYPES.ALL
  const tagFilter = filterState.tag || FILTER_ALL
  const tokenUnit: TokenUnit =
    filterState.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT
  const viewMode = normalizeViewMode(filterState.view)
  const showRechargePrice = filterState.rechargePrice === true

  const updateFilters = useCallback((updates: Record<string, unknown>) => {
    setFilterState((prev) => {
      const next: Record<string, unknown> = { ...prev, ...updates }
      for (const key of Object.keys(next)) {
        if (next[key] === undefined || next[key] === null) {
          delete next[key]
        }
      }
      return next as FilterState
    })
  }, [])

  const setSearchInput = useCallback(
    (v: string) => updateFilters({ search: v || undefined }),
    [updateFilters]
  )
  const setSortBy = useCallback(
    (v: string) =>
      updateFilters({ sort: v === SORT_OPTIONS.NAME ? undefined : v }),
    [updateFilters]
  )
  const setCategoryFilter = useCallback(
    (v: string) =>
      updateFilters({ category: v === FILTER_ALL ? undefined : v }),
    [updateFilters]
  )
  const setQuotaTypeFilter = useCallback(
    (v: string) =>
      updateFilters({ quotaType: v === QUOTA_TYPES.ALL ? undefined : v }),
    [updateFilters]
  )
  const setModelTypeFilter = useCallback(
    (v: string) =>
      updateFilters({
        modelType: v === MODEL_TYPES.ALL ? undefined : v,
      }),
    [updateFilters]
  )
  const setTokenUnit = useCallback(
    (v: TokenUnit) =>
      updateFilters({ tokenUnit: v === DEFAULT_TOKEN_UNIT ? undefined : v }),
    [updateFilters]
  )
  const setViewMode = useCallback(
    (v: ViewMode) =>
      updateFilters({ view: v === VIEW_MODES.CARD ? undefined : v }),
    [updateFilters]
  )
  const setShowRechargePrice = useCallback(
    (v: boolean) => updateFilters({ rechargePrice: v || undefined }),
    [updateFilters]
  )

  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return []

    return filterAndSortModels(
      filterByCategory(models, categoryFilter, categories),
      {
        search: debouncedSearchInput,
        vendor: vendorFilter,
        group: groupFilter,
        quotaType: quotaTypeFilter,
        modelType: modelTypeFilter,
        tag: tagFilter,
        sortBy,
      }
    )
  }, [
    models,
    categories,
    categoryFilter,
    debouncedSearchInput,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    modelTypeFilter,
    tagFilter,
    sortBy,
  ])

  const hasActiveFilters = useMemo(
    () =>
      vendorFilter !== FILTER_ALL ||
      categoryFilter !== FILTER_ALL ||
      groupFilter !== FILTER_ALL ||
      quotaTypeFilter !== QUOTA_TYPES.ALL ||
      modelTypeFilter !== MODEL_TYPES.ALL ||
      tagFilter !== FILTER_ALL,
    [
      vendorFilter,
      categoryFilter,
      groupFilter,
      quotaTypeFilter,
      modelTypeFilter,
      tagFilter,
    ]
  )

  const activeFilterCount = useMemo(
    () =>
      (vendorFilter !== FILTER_ALL ? 1 : 0) +
      (categoryFilter !== FILTER_ALL ? 1 : 0) +
      (groupFilter !== FILTER_ALL ? 1 : 0) +
      (quotaTypeFilter !== QUOTA_TYPES.ALL ? 1 : 0) +
      (modelTypeFilter !== MODEL_TYPES.ALL ? 1 : 0) +
      (tagFilter !== FILTER_ALL ? 1 : 0),
    [
      vendorFilter,
      categoryFilter,
      groupFilter,
      quotaTypeFilter,
      modelTypeFilter,
      tagFilter,
    ]
  )

  const clearFilters = useCallback(() => {
    updateFilters({
      vendor: undefined,
      category: undefined,
      group: undefined,
      quotaType: undefined,
      modelType: undefined,
      tag: undefined,
    })
  }, [updateFilters])

  const clearSearch = useCallback(() => {
    updateFilters({ search: undefined })
  }, [updateFilters])

  return {
    searchInput,
    sortBy,
    vendorFilter,
    categoryFilter,
    groupFilter,
    quotaTypeFilter,
    modelTypeFilter,
    tagFilter,
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
  }
}
