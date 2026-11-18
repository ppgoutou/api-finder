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
  CustomerSupportIcon,
  DashboardSpeed01Icon,
  DiscountTag01Icon,
  InfinityIcon,
  Route01Icon,
  SourceCodeIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'

import type { VipBenefitId } from './benefits'

/** The icon each VIP benefit is drawn with. */
export const VIP_BENEFIT_ICONS: Record<
  VipBenefitId,
  typeof CustomerSupportIcon
> = {
  price: DiscountTag01Icon,
  concurrency: DashboardSpeed01Icon,
  lines: Route01Icon,
  support: CustomerSupportIcon,
  'early-access': SparklesIcon,
  integration: SourceCodeIcon,
  'no-fee': InfinityIcon,
}
