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
import * as z from 'zod'

import {
  PROMO_CARD_KINDS,
  PROMO_POPUP_MAX_CARDS,
  PROMO_POPUP_MAX_DAILY_LIMIT,
  PROMO_POPUP_MAX_DEALS,
  PROMO_POPUP_MAX_TIERS,
} from '@/features/home/lib/promo-popup'

/** Limits mirrored from the server (controller/promo_popup.go). */
const shortText = z
  .string()
  .trim()
  .max(60, { message: 'At most 60 characters' })
const longText = z
  .string()
  .trim()
  .max(160, { message: 'At most 160 characters' })
const amount = z.string().trim().max(16, { message: 'At most 16 characters' })
const unit = amount
const icon = z.string().trim().max(100, { message: 'At most 100 characters' })

const href = z
  .string()
  .trim()
  .max(500, { message: 'At most 500 characters' })
  .refine(
    (value) =>
      value === '' ||
      value.startsWith('https://') ||
      (value.startsWith('/') &&
        !value.startsWith('//') &&
        !value.includes('\\')),
    { message: 'Use a path starting with / or an https link' }
  )

const endsAt = z
  .string()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Use a valid date',
  })

const REQUIRED = 'This field is required'
const DAILY_LIMIT_MESSAGE = 'Enter a whole number from 1 to 20'

const cardSchema = z
  .object({
    kind: z.enum(PROMO_CARD_KINDS),
    title: shortText,
    titleZh: shortText,
    description: longText,
    descriptionZh: longText,
    endsAt,
    href,
    modelName: shortText,
    salePrice: amount,
    originalPrice: amount,
    unit,
    icon,
    tiers: z
      .array(z.object({ pay: amount, bonus: amount }))
      .max(PROMO_POPUP_MAX_TIERS),
    deals: z
      .array(
        z.object({
          modelName: shortText,
          salePrice: amount,
          originalPrice: amount,
          unit,
          icon,
        })
      )
      .max(PROMO_POPUP_MAX_DEALS),
  })
  .superRefine((card, context) => {
    const require = (path: (string | number)[]) =>
      context.addIssue({ code: 'custom', message: REQUIRED, path })

    if (card.kind === 'model') {
      if (!card.modelName) require(['modelName'])
      if (!card.salePrice) require(['salePrice'])
      return
    }
    if (card.kind === 'recharge') {
      if (!card.tiers.some((tier) => tier.pay && tier.bonus)) {
        require(['tiers', 0, 'pay'])
        require(['tiers', 0, 'bonus'])
      }
      return
    }
    if (!card.deals.some((deal) => deal.modelName && deal.salePrice)) {
      require(['deals', 0, 'modelName'])
      require(['deals', 0, 'salePrice'])
    }
  })

export const promoPopupFormSchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z
    .number({ message: DAILY_LIMIT_MESSAGE })
    .int({ message: DAILY_LIMIT_MESSAGE })
    .min(1, { message: DAILY_LIMIT_MESSAGE })
    .max(PROMO_POPUP_MAX_DAILY_LIMIT, { message: DAILY_LIMIT_MESSAGE }),
  cards: z.array(cardSchema).max(PROMO_POPUP_MAX_CARDS),
})

export type PromoPopupFormValues = z.infer<typeof promoPopupFormSchema>
