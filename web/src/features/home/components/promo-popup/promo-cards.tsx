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
  // Up to two models get large price tiles; more share the height in slim rows.
  const roomy = card.deals.length <= 2
  return (
    <article className={CARD_CLASS}>
      <div className={cn(MEDIA_CLASS, 'bg-ink py-5 max-sm:py-4')}>
        <div className='flex items-center gap-2 pr-10 sm:pr-8'>
          <span className={DEAL_PILL_CLASS}>{t('Deals this week')}</span>
          {endLabel && (
            <span className='text-[13px] text-white/70'>{endLabel}</span>
          )}
        </div>
        <h3 className='mt-2.5 line-clamp-2 text-2xl leading-8 font-bold max-sm:mt-1.5 max-sm:text-lg max-sm:leading-7 sm:truncate'>
          {card.title || t('These models are on sale')}
        </h3>
        {card.description && (
          <p
            className={cn(
              'mt-1.5 line-clamp-2 text-sm leading-[22px] text-white/75 max-sm:mt-1 max-sm:text-xs max-sm:leading-[18px]',
              !roomy && 'max-sm:line-clamp-1'
            )}
          >
            {card.description}
          </p>
        )}
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-3 px-8 pt-4 pb-6 max-sm:gap-2 max-sm:px-4 max-sm:pt-3 max-sm:pb-4'>
        <ul className='flex min-h-0 flex-1 flex-col gap-2'>
          {card.deals.map((deal) => {
            const ratio = getPromoPriceRatio(deal.salePrice, deal.originalPrice)
            const discount = ratio === null ? null : getPriceDiscount(ratio)
            return (
              <li key={deal.modelName} className='flex max-h-40 min-h-0 flex-1'>
                <a
                  href={href}
                  onClick={props.onNavigate}
                  className='bg-surface-muted dark:bg-muted hover:ring-brand/40 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 ring-1 ring-transparent transition-shadow max-sm:px-3'
                >
                  {deal.icon && (
                    <span className='shrink-0' aria-hidden>
                      {getLobeIcon(deal.icon, roomy ? 32 : 20)}
                    </span>
                  )}
                  <span className='min-w-0 flex-1'>
                    <span
                      className={cn(
                        'block truncate font-mono font-semibold',
                        roomy ? 'text-base max-sm:text-sm' : 'text-sm'
                      )}
                    >
                      {deal.modelName}
                    </span>
                    {(discount || ratio !== null) && (
                      <span
                        className={cn(
                          'flex items-center gap-2',
                          roomy ? 'mt-2' : 'mt-0.5'
                        )}
                      >
                        {discount && (
                          <span
                            className={cn(
                              'text-ink rounded-md bg-amber-400 font-bold whitespace-nowrap',
                              roomy
                                ? 'px-2 py-0.5 text-sm'
                                : 'px-1.5 text-[11px]'
                            )}
                          >
                            {t('{{percentOff}}% off', discount)}
                          </span>
                        )}
                        {ratio !== null && (
                          <span className='text-muted-foreground truncate text-xs line-through'>
                            {deal.originalPrice}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className='shrink-0 text-right'>
                    <span
                      className={cn(
                        'block font-bold whitespace-nowrap',
                        SALE_TEXT_CLASS,
                        roomy
                          ? 'text-[32px] leading-10 max-sm:text-2xl max-sm:leading-8'
                          : 'text-lg leading-6'
                      )}
                    >
                      {deal.salePrice}
                    </span>
                    {deal.unit && (
                      <span
                        className={cn(
                          'text-muted-foreground block whitespace-nowrap',
                          roomy ? 'text-xs' : 'text-[11px]'
                        )}
                      >
                        {deal.unit}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
        <div className='flex shrink-0'>
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
