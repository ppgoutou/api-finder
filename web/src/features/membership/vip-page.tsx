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

import { MembershipCard } from './components/membership-card'
import { VipActions } from './components/vip-actions'
import { VipBenefitGrid } from './components/vip-benefit-grid'
import { VipCompareTable } from './components/vip-compare-table'
import { VipSavingsCalculator } from './components/vip-savings-calculator'
import { useMembership } from './hooks/use-membership'
import { getVipUpgradeRule } from './lib/benefits'
import { getVipSavingPercent } from './lib/progress'
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
    <PublicLayout showMainContainer={false}>
      {content}
      <Footer />
    </PublicLayout>
  )
}

function VipPageContent(props: { info: MembershipInfo }) {
  const { t } = useTranslation()
  const info = props.info
  const savingPercent = getVipSavingPercent(info)
  const rule = getVipUpgradeRule(info, t)

  let headline = t('Higher concurrency, dedicated lines, 24/7 support')
  if (savingPercent > 0) {
    headline = t('Save {{percent}}% on every model as a VIP', {
      percent: savingPercent,
    })
  }

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

  return (
    <>
      <section className='relative z-10 overflow-hidden px-6 pt-28 pb-12 md:pt-36 md:pb-16'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-amber-400/20 via-amber-300/5 to-transparent'
        />
        <div className='mx-auto max-w-4xl text-center'>
          <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200'>
            <HugeiconsIcon icon={CrownIcon} className='size-3.5' aria-hidden />
            {t('VIP membership')}
          </span>
          <h1 className='mt-5 text-[clamp(2rem,5.5vw,3.5rem)] leading-[1.15] font-bold tracking-tight'>
            {headline}
          </h1>
          <p className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base sm:text-lg'>
            {rule
              ? t(
                  'VIP members run more tasks at once on dedicated priority lines. {{rule}} and you are upgraded automatically, with no membership fee.',
                  { rule }
                )
              : t(
                  'VIP members run more tasks at once on dedicated priority lines, with no membership fee.'
                )}
          </p>
          <VipActions
            info={info}
            source='vip-page-hero'
            className='mt-8 justify-center'
          />
        </div>
        {info.signed_in && (
          <MembershipCard info={info} className='mx-auto mt-10 max-w-4xl' />
        )}
      </section>

      <section className='relative z-10 px-6 py-10 md:py-14'>
        <div className='mx-auto max-w-5xl'>
          <h2 className='text-center text-2xl font-bold tracking-tight md:text-3xl'>
            {t('What VIP members get')}
          </h2>
          <VipBenefitGrid info={info} className='mt-8' />
        </div>
      </section>

      <section className='relative z-10 px-6 py-10 md:py-14'>
        <div className='mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
              {t('Standard vs VIP')}
            </h2>
            <VipCompareTable info={info} className='mt-6' />
          </div>
          {info.vip_price_rate > 0 && info.vip_price_rate < 1 && (
            <div className='lg:pt-14'>
              <VipSavingsCalculator priceRate={info.vip_price_rate} />
            </div>
          )}
        </div>
      </section>

      <section className='relative z-10 px-6 py-10 md:py-14'>
        <div className='mx-auto max-w-5xl'>
          <h2 className='text-center text-2xl font-bold tracking-tight md:text-3xl'>
            {t('How to become VIP')}
          </h2>
          <ol className='mt-8 grid gap-4 md:grid-cols-3'>
            {steps.map((step, index) => (
              <li
                key={step.title}
                className='bg-card border-border/60 rounded-2xl border p-5 shadow-sm'
              >
                <div className='flex items-center gap-2'>
                  <span className='flex size-7 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white'>
                    {index + 1}
                  </span>
                  <HugeiconsIcon
                    icon={step.icon}
                    className='size-5 text-amber-600 dark:text-amber-300'
                    aria-hidden
                  />
                </div>
                <h3 className='mt-3 font-semibold'>{step.title}</h3>
                <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className='relative z-10 px-6 py-10 md:py-14'>
        <div className='mx-auto max-w-3xl'>
          <h2 className='mb-6 text-center text-2xl font-bold tracking-tight md:text-3xl'>
            {t('VIP FAQ')}
          </h2>
          <Accordion
            defaultValue={['fee']}
            className='bg-card border-border/60 rounded-2xl border px-5'
          >
            {faqs.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className='py-4 text-base'>
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className='text-muted-foreground pb-4 text-[15px] leading-relaxed'>
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className='relative z-10 px-6 pt-6 pb-16 md:pb-24'>
        <div className='mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-400/10 to-orange-400/10 px-6 py-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Ready to pay less and run more?')}
          </h2>
          <VipActions
            info={info}
            source='vip-page-bottom'
            className='justify-center'
          />
        </div>
      </section>
    </>
  )
}
