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
import type { MouseEventHandler, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import {
  getPromoBonusShare,
  getPromoPriceRatio,
  PROMO_DEFAULT_HREF,
  type PromoCard,
} from '../../lib/promo-popup'
import { getPriceDiscount } from '../../lib/video-home'

type PromoCardProps = {
  card: PromoCard
  /** Runs when a link in the card is followed. */
  onNavigate?: MouseEventHandler<HTMLAnchorElement>
}

const CARD_CLASS = 'flex h-[484px] flex-col max-sm:h-[404px]'
const MEDIA_CLASS =
  'flex shrink-0 flex-col px-8 py-7 text-white max-sm:px-5 max-sm:py-5'
const BODY_CLASS =
  'flex min-h-0 flex-1 flex-col px-8 py-6 max-sm:px-5 max-sm:py-4'
const DEAL_PILL_CLASS =
  'rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-400'
const SALE_TEXT_CLASS = 'text-amber-700 dark:text-amber-400'

function useEndDateLabel(endsAt: string): string {
  const { i18n, t } = useTranslation()
  if (!endsAt) return ''
  const [year, month, day] = endsAt.split('-').map(Number)
  const date = new Date(year, month - 1, day).toLocaleDateString(
    toIntlLocale(i18n.resolvedLanguage || i18n.language),
    { month: 'short', day: 'numeric' }
  )
  return t('Ends {{date}}', { date })
}

function PromoLink(props: {
  href: string
  variant?: 'default' | 'outline'
  onNavigate?: MouseEventHandler<HTMLAnchorElement>
  children: ReactNode
}) {
  const external = props.href.startsWith('https://')
  return (
    <a
      href={props.href}
      onClick={props.onNavigate}
      className={cn(
        buttonVariants({ variant: props.variant ?? 'default' }),
        'h-11.5 min-w-0 flex-1 rounded-xl text-[15px]'
      )}
      {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
    >
      {props.children}
    </a>
  )
}

function PromoCopy(props: { card: PromoCard }) {
  return (
    <>
      {props.card.title && (
        <h3 className='truncate text-[22px] leading-[30px] font-bold max-sm:text-lg'>
          {props.card.title}
        </h3>
      )}
      {props.card.description && (
        <p className='text-muted-foreground mt-2 line-clamp-2 text-sm leading-[22px]'>
          {props.card.description}
        </p>
      )}
    </>
  )
}

function ModelPromoCard(props: PromoCardProps) {
  const { t } = useTranslation()
  const card = props.card
  const endLabel = useEndDateLabel(card.endsAt)
  const ratio = getPromoPriceRatio(card.salePrice, card.originalPrice)
  return (
    <article className={CARD_CLASS}>
      <div className={cn(MEDIA_CLASS, 'bg-ink h-[248px] max-sm:h-[196px]')}>
        <div className='flex items-center gap-2 pr-10 sm:pr-8'>
          <span className={DEAL_PILL_CLASS}>{t('Limited-time price')}</span>
          {endLabel && (
            <span className='text-[13px] text-white/70'>{endLabel}</span>
          )}
        </div>
        <div className='mt-4 flex min-w-0 items-center gap-3 max-sm:mt-3'>
          {card.icon && (
            <span className='shrink-0' aria-hidden>
              {getLobeIcon(card.icon, 36)}
            </span>
          )}
          <p className='min-w-0 truncate font-mono text-[40px] leading-12 font-semibold tracking-tight max-sm:text-[28px] max-sm:leading-9'>
            {card.modelName}
          </p>
        </div>
        {ratio === null ? (
          <p className='mt-auto text-[32px] leading-10 font-bold text-amber-400'>
            {card.salePrice}
            <span className='text-sm font-normal'> {card.unit}</span>
          </p>
        ) : (
          <div className='mt-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3'>
            <span className='text-[13px] font-semibold text-amber-400'>
              {t('Sale')}
            </span>
            <span className='block h-2.5 rounded-full bg-white/10'>
              <span
                className='block h-2.5 rounded-full bg-amber-400'
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
            <span className='text-right text-lg font-bold text-amber-400'>
              {card.salePrice}
              <span className='text-xs font-normal'> {card.unit}</span>
            </span>
            <span className='text-[13px] text-white/70'>{t('Original')}</span>
            <span className='block h-2.5 rounded-full bg-white/30' />
            <span className='text-right text-sm text-white/70 line-through'>
              {card.originalPrice} {card.unit}
            </span>
          </div>
        )}
      </div>
      <div className={BODY_CLASS}>
        <PromoCopy card={card} />
        <div className='mt-auto flex gap-3'>
          <PromoLink
            href={card.href || PROMO_DEFAULT_HREF.model}
            onNavigate={props.onNavigate}
          >
            {t('Try now')}
          </PromoLink>
          <PromoLink
            href='/pricing'
            variant='outline'
            onNavigate={props.onNavigate}
          >
            {t('View all prices')}
          </PromoLink>
        </div>
      </div>
    </article>
  )
}

function RechargePromoCard(props: PromoCardProps) {
  const { t } = useTranslation()
  const card = props.card
  const endLabel = useEndDateLabel(card.endsAt)
  const headline = card.tiers[0]
  const bonusShare = headline ? getPromoBonusShare(headline) : null
  return (
    <article className={CARD_CLASS}>
      <div className={cn(MEDIA_CLASS, 'h-[248px] bg-brand max-sm:h-[196px]')}>
        <div className='flex items-center gap-2 pr-10 sm:pr-8'>
          <span className='text-brand-hover rounded-full bg-white px-2.5 py-1 text-xs font-semibold'>
            {t('Top-up offer')}
          </span>
          {endLabel && <span className='text-[13px]'>{endLabel}</span>}
        </div>
        {headline && (
          <p className='mt-4 truncate text-[44px] leading-13 font-bold max-sm:mt-3 max-sm:text-[28px] max-sm:leading-9'>
            {t('Pay {{pay}}, get {{bonus}} free', headline)}
          </p>
        )}
        {bonusShare !== null && (
          <div className='mt-auto'>
            <div className='flex h-3 gap-1'>
              <span className='flex-1 rounded-l-full rounded-r-sm bg-white' />
              <span
                className='rounded-l-sm rounded-r-full bg-amber-400'
                style={{ width: `max(${bonusShare * 100}%, 12px)` }}
              />
            </div>
            <div className='mt-2 flex justify-between text-[13px]'>
              <span>{t('Top-up amount')}</span>
              <span className='font-semibold'>{t('Bonus')}</span>
            </div>
          </div>
        )}
      </div>
      <div className={BODY_CLASS}>
        {card.tiers.length > 1 && (
          <ul className='grid grid-cols-3 gap-2.5'>
            {card.tiers.map((tier) => (
              <li
                key={`${tier.pay}-${tier.bonus}`}
                className='bg-surface-muted dark:bg-muted min-w-0 rounded-xl p-3 max-sm:p-2'
              >
                <p className='truncate text-base font-bold max-sm:text-sm'>
                  {tier.pay}
                </p>
                <p className='text-brand-hover dark:text-brand-on-dark mt-0.5 truncate text-[13px]'>
                  {t('+{{bonus}} free', { bonus: tier.bonus })}
                </p>
              </li>
            ))}
          </ul>
        )}
        {card.description && (
          <p className='text-muted-foreground mt-3.5 line-clamp-2 text-sm leading-[22px]'>
            {card.description}
          </p>
        )}
        <div className='mt-auto flex'>
          <PromoLink
            href={card.href || PROMO_DEFAULT_HREF.recharge}
            onNavigate={props.onNavigate}
          >
            {t('Top up now')}
          </PromoLink>
        </div>
      </div>
    </article>
  )
}

function ListPromoCard(props: PromoCardProps) {
  const { t } = useTranslation()
  const card = props.card
  const endLabel = useEndDateLabel(card.endsAt)
  const href = card.href || PROMO_DEFAULT_HREF.list
  return (
    <article className={CARD_CLASS}>
      <div
        className={cn(
          MEDIA_CLASS,
          'bg-ink h-[104px] py-5 max-sm:h-[92px] max-sm:py-4'
        )}
      >
        <div className='flex items-center gap-2 pr-10 sm:pr-8'>
          <span className={DEAL_PILL_CLASS}>{t('Deals this week')}</span>
          {endLabel && (
            <span className='text-[13px] text-white/70'>{endLabel}</span>
          )}
        </div>
        <h3 className='mt-2.5 truncate text-[22px] leading-[30px] font-bold max-sm:mt-1.5 max-sm:text-lg'>
          {card.title || t('These models are on sale')}
        </h3>
      </div>
      <div className='flex min-h-0 flex-1 flex-col px-8 pt-1.5 pb-6 max-sm:px-5 max-sm:pb-4'>
        <ul className='min-h-0'>
          {card.deals.map((deal) => {
            const ratio = getPromoPriceRatio(deal.salePrice, deal.originalPrice)
            const discount = ratio === null ? null : getPriceDiscount(ratio)
            return (
              <li key={deal.modelName} className='border-b'>
                <a
                  href={href}
                  onClick={props.onNavigate}
                  className='hover:text-brand-hover dark:hover:text-brand-on-dark flex h-[66px] items-center gap-3 max-sm:h-[56px]'
                >
                  {deal.icon && (
                    <span className='shrink-0' aria-hidden>
                      {getLobeIcon(deal.icon, 20)}
                    </span>
                  )}
                  <span className='min-w-0 flex-1 truncate font-mono text-[15px] font-semibold max-sm:text-sm'>
                    {deal.modelName}
                  </span>
                  {ratio !== null && (
                    <span className='text-muted-foreground text-[13px] line-through max-sm:hidden'>
                      {deal.originalPrice}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-[17px] font-bold whitespace-nowrap',
                      SALE_TEXT_CLASS
                    )}
                  >
                    {deal.salePrice}
                    <span className='text-xs font-normal'> {deal.unit}</span>
                  </span>
                  {discount && (
                    <span
                      className={cn(
                        'bg-surface-muted dark:bg-muted rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                        SALE_TEXT_CLASS
                      )}
                    >
                      {t('{{percentOff}}% off', discount)}
                    </span>
                  )}
                </a>
              </li>
            )
          })}
        </ul>
        <div className='mt-auto flex'>
          <PromoLink href={href} onNavigate={props.onNavigate}>
            {t('View all deals')}
          </PromoLink>
        </div>
      </div>
    </article>
  )
}

export function PromoCardView(props: PromoCardProps) {
  if (props.card.kind === 'model') return <ModelPromoCard {...props} />
  if (props.card.kind === 'recharge') return <RechargePromoCard {...props} />
  return <ListPromoCard {...props} />
}
