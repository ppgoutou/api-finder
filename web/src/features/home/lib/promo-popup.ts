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

/**
 * Home page promotion popup settings stored in the `PromoPopup` option as
 * JSON. Prices are display text written by the admin; nothing here affects
 * what a request is billed.
 */
import { normalizeInterfaceLanguage } from '@/i18n/languages'

export const PROMO_POPUP_OPTION_KEY = 'PromoPopup'
export const PROMO_POPUP_MAX_CARDS = 5
export const PROMO_POPUP_MAX_TIERS = 3
export const PROMO_POPUP_MAX_DEALS = 4
export const PROMO_POPUP_DEFAULT_DAILY_LIMIT = 1
export const PROMO_POPUP_MAX_DAILY_LIMIT = 20

export const PROMO_CARD_KINDS = ['model', 'recharge', 'list'] as const
export type PromoCardKind = (typeof PROMO_CARD_KINDS)[number]

export type PromoTier = { pay: string; bonus: string }

export type PromoDeal = {
  modelName: string
  salePrice: string
  originalPrice: string
  unit: string
  /** Lobe icon name, usually copied from the model. */
  icon: string
}

export type PromoCard = {
  kind: PromoCardKind
  title: string
  titleZh: string
  description: string
  descriptionZh: string
  /** Last day of the offer as YYYY-MM-DD; empty never expires. */
  endsAt: string
  /** Same-site path or https link; empty uses the card kind's default page. */
  href: string
  modelName: string
  salePrice: string
  originalPrice: string
  unit: string
  /** Lobe icon name, usually copied from the model. */
  icon: string
  tiers: PromoTier[]
  deals: PromoDeal[]
}

export type PromoPopupSettings = {
  enabled: boolean
  /** How many times one browser can see the popup per day. */
  dailyLimit: number
  cards: PromoCard[]
}

export const PROMO_DEFAULT_HREF: Record<PromoCardKind, string> = {
  model: '/video-studio',
  recharge: '/wallet',
  list: '/pricing',
}

export const EMPTY_PROMO_POPUP: PromoPopupSettings = {
  enabled: false,
  dailyLimit: PROMO_POPUP_DEFAULT_DAILY_LIMIT,
  cards: [],
}

export function emptyPromoCard(kind: PromoCardKind = 'model'): PromoCard {
  return {
    kind,
    title: '',
    titleZh: '',
    description: '',
    descriptionZh: '',
    endsAt: '',
    href: '',
    modelName: '',
    salePrice: '',
    originalPrice: '',
    unit: '',
    icon: '',
    tiers: [{ pay: '', bonus: '' }],
    deals: [
      { modelName: '', salePrice: '', originalPrice: '', unit: '', icon: '' },
    ],
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readText(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

function readCard(value: unknown): PromoCard | null {
  const source = asRecord(value)
  const kind = PROMO_CARD_KINDS.find((item) => item === source.kind)
  if (!kind) return null
  const tiers = Array.isArray(source.tiers) ? source.tiers : []
  const deals = Array.isArray(source.deals) ? source.deals : []
  return {
    kind,
    title: readText(source, 'title'),
    titleZh: readText(source, 'title_zh'),
    description: readText(source, 'description'),
    descriptionZh: readText(source, 'description_zh'),
    endsAt: readText(source, 'ends_at'),
    href: readText(source, 'href'),
    modelName: readText(source, 'model_name'),
    salePrice: readText(source, 'sale_price'),
    originalPrice: readText(source, 'original_price'),
    unit: readText(source, 'unit'),
    icon: readText(source, 'icon'),
    tiers: tiers.map((tier) => {
      const row = asRecord(tier)
      return { pay: readText(row, 'pay'), bonus: readText(row, 'bonus') }
    }),
    deals: deals.map((deal) => {
      const row = asRecord(deal)
      return {
        modelName: readText(row, 'model_name'),
        salePrice: readText(row, 'sale_price'),
        originalPrice: readText(row, 'original_price'),
        unit: readText(row, 'unit'),
        icon: readText(row, 'icon'),
      }
    }),
  }
}

function readDailyLimit(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= PROMO_POPUP_MAX_DAILY_LIMIT
    ? value
    : PROMO_POPUP_DEFAULT_DAILY_LIMIT
}

export function parsePromoPopup(
  raw: string | null | undefined
): PromoPopupSettings {
  if (!raw?.trim()) return EMPTY_PROMO_POPUP
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_PROMO_POPUP
  }
  const source = asRecord(parsed)
  const cards = Array.isArray(source.cards) ? source.cards : []
  return {
    enabled: source.enabled === true,
    dailyLimit: readDailyLimit(source.daily_limit),
    cards: cards
      .map(readCard)
      .filter((card): card is PromoCard => card !== null),
  }
}

/** Stores only the fields the card's kind shows. */
export function serializePromoPopup(settings: PromoPopupSettings): string {
  if (
    !settings.enabled &&
    settings.cards.length === 0 &&
    settings.dailyLimit === PROMO_POPUP_DEFAULT_DAILY_LIMIT
  ) {
    return ''
  }
  return JSON.stringify({
    enabled: settings.enabled,
    daily_limit: settings.dailyLimit,
    cards: settings.cards.map((card) => ({
      kind: card.kind,
      title: card.title,
      title_zh: card.titleZh,
      description: card.description,
      description_zh: card.descriptionZh,
      ends_at: card.endsAt,
      href: card.href,
      ...(card.kind === 'model' && {
        model_name: card.modelName,
        sale_price: card.salePrice,
        original_price: card.originalPrice,
        unit: card.unit,
        icon: card.icon,
      }),
      ...(card.kind === 'recharge' && { tiers: card.tiers }),
      ...(card.kind === 'list' && {
        deals: card.deals.map((deal) => ({
          model_name: deal.modelName,
          sale_price: deal.salePrice,
          original_price: deal.originalPrice,
          unit: deal.unit,
          icon: deal.icon,
        })),
      }),
    })),
  })
}

/** Whether a card has the content its layout needs. */
export function isPromoCardComplete(card: PromoCard): boolean {
  if (card.kind === 'model') {
    return Boolean(card.modelName.trim() && card.salePrice.trim())
  }
  if (card.kind === 'recharge') {
    return card.tiers.some((tier) => tier.pay.trim() && tier.bonus.trim())
  }
  return card.deals.some(
    (deal) => deal.modelName.trim() && deal.salePrice.trim()
  )
}

/** Local calendar day as YYYY-MM-DD. */
export function toPromoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Cards to show on `today`, in the interface language. */
export function selectPromoCards(
  settings: PromoPopupSettings,
  language: string,
  today: string
): PromoCard[] {
  if (!settings.enabled) return []
  const interfaceLanguage = normalizeInterfaceLanguage(language)
  const chinese = interfaceLanguage === 'zhCN' || interfaceLanguage === 'zhTW'
  return settings.cards
    .filter(
      (card) =>
        isPromoCardComplete(card) && (!card.endsAt || card.endsAt >= today)
    )
    .map((card) => ({
      ...card,
      title: (chinese && card.titleZh.trim()) || card.title,
      description: (chinese && card.descriptionZh.trim()) || card.description,
      tiers: card.tiers.filter((tier) => tier.pay.trim() && tier.bonus.trim()),
      deals: card.deals.filter(
        (deal) => deal.modelName.trim() && deal.salePrice.trim()
      ),
    }))
}

/** Reads the number out of display text such as `¥0.12` or `$1,200`. */
function readAmount(text: string): number | null {
  const match = text.replaceAll(',', '').match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const amount = Number(match[0])
  return amount > 0 ? amount : null
}

/** Sale price as a share of the original; null when it is not a real saving. */
export function getPromoPriceRatio(
  salePrice: string,
  originalPrice: string
): number | null {
  const sale = readAmount(salePrice)
  const original = readAmount(originalPrice)
  if (sale === null || original === null || sale >= original) return null
  return sale / original
}

/** Bonus as a share of pay plus bonus; null when the text has no numbers. */
export function getPromoBonusShare(tier: PromoTier): number | null {
  const pay = readAmount(tier.pay)
  const bonus = readAmount(tier.bonus)
  if (pay === null || bonus === null) return null
  return bonus / (pay + bonus)
}

const DISMISSED_DAY_KEY = 'promo-popup-dismissed-day'
const VIEWS_KEY = 'promo-popup-views'

/** How many times this browser has shown the popup on `today`. */
function readViewCount(today: string): number {
  const raw = localStorage.getItem(VIEWS_KEY)
  if (!raw) return 0
  try {
    const views = asRecord(JSON.parse(raw))
    return views.day === today && typeof views.count === 'number'
      ? views.count
      : 0
  } catch {
    return 0
  }
}

/**
 * Whether the popup should stay closed: this browser turned it off for today
 * or has reached the daily limit. Blocked storage counts as neither.
 */
export function isPromoPopupSuppressed(
  today: string,
  dailyLimit: number
): boolean {
  try {
    return (
      localStorage.getItem(DISMISSED_DAY_KEY) === today ||
      readViewCount(today) >= dailyLimit
    )
  } catch {
    return false
  }
}

export function recordPromoPopupView(today: string): void {
  try {
    localStorage.setItem(
      VIEWS_KEY,
      JSON.stringify({ day: today, count: readViewCount(today) + 1 })
    )
  } catch {
    // Without storage the popup simply shows again next time.
  }
}

export function dismissPromoPopupForDay(today: string): void {
  try {
    localStorage.setItem(DISMISSED_DAY_KEY, today)
  } catch {
    // Without storage the popup simply shows again next time.
  }
}
