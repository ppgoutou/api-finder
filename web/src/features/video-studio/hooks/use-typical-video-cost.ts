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
import { DEFAULT_DRAFT } from '../constants'
import { fitDraftToModel } from '../lib/draft'
import { useStudioModels } from './use-studio-models'
import { useStudioPricer } from './use-studio-price'

/**
 * What one video of the first available model costs at the default settings,
 * to tell how many videos an amount buys; null while prices are loading.
 */
export function useTypicalVideoCost(): {
  costUSD: number
  /** The settings it was priced at, such as "720P · 5s". */
  resolution: string
  seconds: number
} | null {
  const models = useStudioModels()
  const priceOf = useStudioPricer()
  const draft = fitDraftToModel(DEFAULT_DRAFT, models)
  if (models.length === 0) return null
  const price = priceOf(draft)
  if (!price || price.costUSD <= 0) return null
  return {
    costUSD: price.costUSD,
    resolution: draft.resolution.toUpperCase(),
    seconds: draft.seconds,
  }
}
