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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { selectLanguageBlock } from '@/lib/language-blocks'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPricing } from '../api'
import type { PricingCategory } from '../types'

const EMPTY_CATEGORIES: PricingCategory[] = []

/** How often a live caller polls, so channel changes show up without reload. */
const LIVE_PRICING_INTERVAL = 30 * 1000

/**
 * Public pricing list. A live caller always refetches on mount and window
 * focus and polls every 30 seconds, so models whose channels were enabled or
 * disabled appear or disappear while the page stays open.
 */
export function usePricingData(enabled = true, live = false) {
  const { status } = useStatus()
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage || i18n.language

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: live ? 0 : 5 * 60 * 1000,
    refetchInterval: live ? LIVE_PRICING_INTERVAL : false,
    enabled,
  })

  // Ensure rates never reach zero to prevent division errors
  const priceRate = useMemo(
    () => Math.max((status?.price as number) ?? 1, 0.001),
    [status?.price]
  )
  const usdExchangeRate = useMemo(
    () => Math.max((status?.usd_exchange_rate as number) ?? priceRate, 0.001),
    [status?.usd_exchange_rate, priceRate]
  )

  const models = useMemo(() => {
    if (!data?.data || !data?.vendors) return []

    const vendorMap = new Map(data.vendors.map((v) => [v.id, v]))

    return data.data.map((model) => {
      const vendor = model.vendor_id
        ? vendorMap.get(model.vendor_id)
        : undefined
      return {
        ...model,
        key: model.model_name,
        description_blocks: model.description,
        description: model.description
          ? selectLanguageBlock(model.description, language)
          : model.description,
        vendor_name: vendor?.name,
        vendor_icon: vendor?.icon,
        vendor_description: vendor?.description
          ? selectLanguageBlock(vendor.description, language)
          : vendor?.description,
        group_ratio: data.group_ratio,
      }
    })
  }, [data, language])

  const categories = useMemo(() => {
    if (!data?.categories) return EMPTY_CATEGORIES
    return data.categories.map((category) => ({
      ...category,
      description: category.description
        ? selectLanguageBlock(category.description, language)
        : category.description,
    }))
  }, [data, language])

  return {
    models,
    vendors: data?.vendors ?? [],
    categories,
    groupRatio: data?.group_ratio ?? {},
    usableGroup: data?.usable_group ?? {},
    endpointMap: data?.supported_endpoint ?? {},
    autoGroups: data?.auto_groups ?? [],
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
  }
}
