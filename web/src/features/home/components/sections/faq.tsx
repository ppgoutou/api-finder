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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  getVipBenefits,
  getVipUpgradeRule,
  useMembership,
  VipCompareButton,
} from '@/features/membership'
import { useStatus } from '@/hooks/use-status'

import { useSeedancePricing } from '../../hooks/use-seedance-pricing'
import { SupportContacts } from '../support-contacts'

export function Faq() {
  const { t } = useTranslation()
  const { bestDiscount } = useSeedancePricing()
  const { status } = useStatus()
  const { data: membership } = useMembership()
  const vipRule = membership ? getVipUpgradeRule(membership, t) : null

  const items = [
    {
      id: 'no-code',
      question: t('Do I need to write code?'),
      answer: (
        <p>
          {t(
            'No. Create videos right in the browser with Video Creation. Developers can also call the same models through the API.'
          )}
        </p>
      ),
    },
    {
      id: 'billing',
      question: t('How is it billed?'),
      answer: (
        <p>
          {t(
            'By the seconds and resolution of the generated video, deducted from your balance on each call. Tasks with a reference video are billed by tokens.'
          )}
          {bestDiscount && (
            <> {t('{{percentOff}}% off official prices', bestDiscount)}</>
          )}
        </p>
      ),
    },
    {
      id: 'specs',
      question: t('Which resolutions and durations are supported?'),
      answer: (
        <p>
          {t(
            'seedance-2.0 supports 480p to 4K and 4–15 seconds per clip; seedance-2.5 supports 480p to 1080p and 4–30 seconds per clip.'
          )}
        </p>
      ),
    },
    {
      id: 'topup',
      question: t('How do I top up?'),
      answer: (
        <p>
          {t(
            'After signing in, top up by bank card on the Wallet page. Payments are processed securely by Stripe and credited immediately.'
          )}
        </p>
      ),
    },
    ...(membership?.enabled
      ? [
          {
            id: 'vip',
            question: t('What do VIP members get?'),
            answer: (
              <>
                <ul className='list-disc space-y-1 ps-5'>
                  {getVipBenefits(membership, t)
                    .slice(0, 4)
                    .map((benefit) => (
                      <li key={benefit.id}>{benefit.title}</li>
                    ))}
                </ul>
                <p className='mt-2'>
                  {vipRule &&
                    t('{{rule}} to upgrade automatically.', {
                      rule: vipRule,
                    })}{' '}
                  <VipCompareButton source='home-faq' />
                </p>
              </>
            ),
          },
        ]
      : []),
    ...(status?.refund_policy_enabled
      ? [
          {
            id: 'refund',
            question: t('Can I get a refund?'),
            answer: (
              <p>
                {t('Refunds follow our refund policy.')}{' '}
                <Link
                  to='/refund-policy'
                  className='text-brand dark:text-brand-on-dark hover:underline'
                >
                  {t('Refund Policy')}
                </Link>
              </p>
            ),
          },
        ]
      : []),
    {
      id: 'help',
      question: t('How do I get help?'),
      answer: <SupportContacts />,
    },
  ]

  return (
    <section className='relative z-10 px-6 py-14 md:py-20'>
      <div className='mx-auto max-w-3xl'>
        <h2 className='text-heading-2 mb-8 text-center'>{t('FAQ')}</h2>
        <Accordion
          defaultValue={['no-code']}
          className='bg-card border-border/60 rounded-2xl border px-5'
        >
          {items.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className='py-4 text-base'>
                {item.question}
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground text-body-lg pb-4 leading-relaxed'>
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
