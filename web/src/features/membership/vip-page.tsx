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
  CrownIcon,
  Tick02Icon,
  UserAdd01Icon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

import { MembershipCard } from './components/membership-card'
import { VipActions } from './components/vip-actions'
import { VipBenefitGrid } from './components/vip-benefit-grid'
import { VipHighlights } from './components/vip-highlights'
import { VipSavingsCalculator } from './components/vip-savings-calculator'
import { VipTierCards } from './components/vip-tier-cards'
import { useMembership } from './hooks/use-membership'
import { getVipUpgradeRule } from './lib/benefits'
import { getVipSavingPercent } from './lib/progress'
import {
  VIP_DISPLAY_FONT,
  VIP_NIGHT_TEXT,
  VIP_NIGHT_PANEL,
  VIP_NIGHT_STAGE,
} from './lib/vip-style'
import type { MembershipInfo } from './types'

/** The public VIP page: benefits, the comparison, how to upgrade and a FAQ. */
export function VipPage() {
  const { t } = useTranslation()
  const { data: info, isLoading } = useMembership()

  useEffect(() => {
    trackEvent('vip_page_view')
  }, [])

  let content = (
    <div className='mx-auto max-w-5xl space-y-4 px-6 pt-28'>
      <Skeleton className='h-12 w-2/3' />
      <Skeleton className='h-40 w-full' />
    </div>
  )
  if (!isLoading && !info?.enabled) {
    content = (
      <p className='text-muted-foreground px-6 pt-32 pb-24 text-center'>
        {t('The VIP program is not open right now.')}
      </p>
    )
  }
  if (info?.enabled) content = <VipPageContent info={info} />

  return (
    <PublicLayout
      showMainContainer={false}
      headerProps={{ className: 'dark text-foreground' }}
    >
      <div className={cn('relative isolate min-h-screen', VIP_NIGHT_STAGE)}>
        {content}
        <Footer />
      </div>
    </PublicLayout>
  )
}

function VipPageContent(props: { info: MembershipInfo }) {
  const { t } = useTranslation()
  const info = props.info
  const savingPercent = getVipSavingPercent(info)
  const rule = getVipUpgradeRule(info, t)

  const steps = [
    {
      icon: UserAdd01Icon,
      title: t('Create a free account'),
      text: t('Every new account starts as a standard member.'),
    },
    {
      icon: Wallet01Icon,
      title: rule ?? t('Top up your balance'),
      text: t('Online top-ups and redemption codes both count.'),
    },
    {
      icon: CrownIcon,
      title: t('Become VIP automatically'),
      text: t(
        'Your account is upgraded the moment the threshold is reached, and VIP prices apply to the next request.'
      ),
    },
  ]

  const faqs = [
    {
      id: 'fee',
      question: t('Is there a monthly fee for VIP?'),
      answer: t(
        'No. VIP is not a subscription: you top up as usual and keep the balance, and once you qualify you stay VIP.'
      ),
    },
    {
      id: 'codes',
      question: t('Do redemption codes count toward VIP?'),
      answer: t(
        'Yes. Paid top-ups and redemption codes both count. Invitation rewards, check-in rewards and test credit do not.'
      ),
    },
    {
      id: 'api',
      question: t('Do VIP prices apply to API calls too?'),
      answer: t(
        'Yes. VIP prices, concurrency and lines apply to every request of your account, from the website and from the API alike.'
      ),
    },
    {
      id: 'refund',
      question: t('What happens after a refund?'),
      answer: t(
        'If a refunded payment was what qualified you, your account returns to the standard tier.'
      ),
    },
    {
      id: 'support',
      question: t('How do I reach VIP support?'),
      answer: t(
        'The dedicated Telegram account appears on your Wallet page and in the support button once you are VIP.'
      ),
    },
  ]

  const promises = [
    t('Redemption codes count'),
    t('Also applies to API calls'),
    t('No renewal needed'),
  ]
  const sectionTitle =
    'bg-gradient-to-b from-white to-white/70 bg-clip-text text-3xl font-semibold tracking-[-0.04em] text-transparent md:text-4xl'

  return (
    <>
      <section className='relative overflow-hidden px-6 pt-32 pb-14 md:pt-40 md:pb-20'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)] bg-[size:72px_72px]'
        />
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_55%_50%_at_50%_20%,rgba(124,58,237,0.28),transparent_70%)]'
        />
        <div className='mx-auto max-w-4xl text-center'>
          <span className='text-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70 uppercase'>
            <span className='bg-accent-night size-1.5 rounded-full shadow-[0_0_10px_var(--color-accent-night)]' />
            {t('VIP membership')}
          </span>
          {savingPercent > 0 ? (
            <h1 className={cn('mt-6 leading-[0.92]', VIP_DISPLAY_FONT)}>
              <span className='block text-[clamp(2.25rem,6vw,4.25rem)]'>
                {t('Save on every model')}
              </span>
              <span
                className={cn(
                  'mt-2 block text-[clamp(5rem,16vw,10rem)] drop-shadow-[0_0_40px_rgba(167,139,250,0.4)]',
                  VIP_NIGHT_TEXT
                )}
              >
                {savingPercent}%
              </span>
            </h1>
          ) : (
            <h1
              className={cn(
                'mt-6 text-[clamp(2.25rem,6vw,4.25rem)] leading-[0.95]',
                VIP_DISPLAY_FONT
              )}
            >
              {t('Higher concurrency, dedicated lines, 24/7 support')}
            </h1>
          )}
          <p className='mx-auto mt-6 max-w-2xl text-base text-balance text-white/60 sm:text-lg'>
            {rule
              ? t(
                  '{{rule}} and you are upgraded automatically, with no membership fee.',
                  { rule }
                )
              : t(
                  'No membership fee: top up as usual and you are upgraded automatically.'
                )}
          </p>
          <VipActions
            info={info}
            source='vip-page-hero'
            night
            className='mt-8 justify-center'
          />
          <ul className='mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-white/50'>
            {promises.map((promise) => (
              <li key={promise} className='flex items-center gap-1.5'>
                <HugeiconsIcon
                  icon={Tick02Icon}
                  className={cn('size-4', VIP_NIGHT_TEXT)}
                  aria-hidden
                />
                {promise}
              </li>
            ))}
          </ul>
          <VipHighlights
            info={info}
            size='lg'
            omitSaving
            className='mx-auto mt-14 max-w-2xl'
          />
        </div>
        {info.signed_in && (
          <MembershipCard
            info={info}
            className='mx-auto mt-10 max-w-4xl border-white/10 bg-white/[0.03]'
          />
        )}
      </section>

      <section className='px-6 py-12 md:py-16'>
        <div className='mx-auto max-w-5xl'>
          <h2 className={sectionTitle}>{t('Standard vs VIP')}</h2>
          <p className='mt-2 text-sm text-white/50'>
            {t('Both tiers are free. Your top-ups unlock VIP.')}
          </p>
          <VipTierCards info={info} className='mt-8' />
        </div>
      </section>

      <section className='px-6 py-12 md:py-16'>
        <div className='mx-auto max-w-5xl'>
          <h2 className={sectionTitle}>{t('What VIP members get')}</h2>
          <VipBenefitGrid info={info} limit={6} night className='mt-8' />
        </div>
      </section>

      <section className='px-6 py-12 md:py-16'>
        <div className='mx-auto grid max-w-5xl gap-8 lg:grid-cols-2 lg:items-start lg:gap-12'>
          <div>
            <h2 className={sectionTitle}>{t('How to become VIP')}</h2>
            <ol className='mt-8 space-y-3'>
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className={cn(
                    'flex items-start gap-5 rounded-3xl p-5',
                    VIP_NIGHT_PANEL
                  )}
                >
                  <span
                    className={cn(
                      'text-4xl leading-none text-white/40',
                      VIP_DISPLAY_FONT,
                      index === steps.length - 1 && VIP_NIGHT_TEXT
                    )}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className='min-w-0'>
                    <h3 className='flex items-center gap-2 font-semibold'>
                      <HugeiconsIcon
                        icon={step.icon}
                        className='size-4 text-white/50'
                        aria-hidden
                      />
                      {step.title}
                    </h3>
                    <p className='mt-1 text-sm leading-relaxed text-white/50'>
                      {step.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {info.vip_price_rate > 0 && info.vip_price_rate < 1 && (
            <div className='lg:pt-[4.5rem]'>
              <VipSavingsCalculator priceRate={info.vip_price_rate} />
            </div>
          )}
        </div>
      </section>

      <section className='px-6 py-12 md:py-16'>
        <div className='mx-auto max-w-3xl'>
          <h2 className={cn('mb-8 text-center', sectionTitle)}>
            {t('VIP FAQ')}
          </h2>
          <Accordion
            defaultValue={['fee']}
            className={cn('rounded-3xl px-6', VIP_NIGHT_PANEL)}
          >
            {faqs.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className='border-white/10'
              >
                <AccordionTrigger className='py-5 text-base'>
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className='text-body-lg pb-5 leading-relaxed text-white/55'>
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className='px-6 pt-8 pb-20 md:pb-28'>
        <div className='border-accent-night/35 rounded-panel bg-night-raised relative mx-auto flex max-w-5xl flex-col items-center gap-4 overflow-hidden border px-6 py-14 text-center shadow-[0_0_100px_-30px_rgba(124,58,237,0.55)]'>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-0 bg-[radial-gradient(80%_90%_at_50%_0%,rgba(124,58,237,0.3),transparent_65%)]'
          />
          <HugeiconsIcon
            icon={CrownIcon}
            className={cn('relative size-9', VIP_NIGHT_TEXT)}
            aria-hidden
          />
          <h2
            className={cn(
              'relative text-[clamp(1.75rem,4.5vw,3rem)] leading-[1.05]',
              VIP_DISPLAY_FONT
            )}
          >
            {t('Ready to pay less and run more?')}
          </h2>
          {rule && !info.is_vip && (
            <p className='relative text-sm text-white/55'>{rule}</p>
          )}
          <VipActions
            info={info}
            source='vip-page-bottom'
            night
            className='relative mt-3 justify-center'
          />
        </div>
      </section>
    </>
  )
}
