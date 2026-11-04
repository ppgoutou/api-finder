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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { AffiliateSummary, UserWalletData } from '../types'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  affiliateCode: string
  affiliateLink: string
  /** Referral totals and the current rebate rules */
  summary?: AffiliateSummary
  onTransfer: () => void
  complianceConfirmed?: boolean
  loading?: boolean
}

export function AffiliateRewardsCard(props: AffiliateRewardsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <Card
        data-card-hover='false'
        className='bg-brand-soft border-0 py-0 shadow-none'
      >
        <CardContent className='grid gap-4 p-4 sm:p-7 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14'>
          <div>
            <Skeleton className='h-7 w-56' />
            <Skeleton className='mt-3 h-4 w-full' />
            <Skeleton className='mt-4 h-12 rounded-xl' />
          </div>
          <Skeleton className='h-28 rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  const complianceConfirmed = props.complianceConfirmed ?? true
  const rebatePercent = props.summary?.rebate_percent ?? 0
  const holdDays = props.summary?.hold_days ?? 0
  // Older invitation rewards still sit in aff_quota and may be transferred
  // by hand; rebates never do.
  const legacyRewards = props.user?.aff_quota ?? 0

  let arrivalStep = t(
    'Each rebate moves into your balance within 10 minutes. A refund by your friend takes it back.'
  )
  if (holdDays > 0) {
    arrivalStep = t(
      'Each rebate moves into your balance automatically {{days}} days after it is earned. It cannot be transferred early, and a refund by your friend in the meantime takes it back.',
      { days: holdDays }
    )
  }

  return (
    <Card
      data-card-hover='false'
      className='bg-brand-soft border-0 py-0 shadow-none'
    >
      <CardContent className='grid gap-5 p-4 sm:p-7'>
        <div className='grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-x-14 lg:gap-y-4'>
          <div className='min-w-0'>
            {rebatePercent > 0 ? (
              <>
                <div className='text-brand-hover dark:text-brand-on-dark text-sm font-semibold'>
                  {t('Referral Program')}
                </div>
                <h3 className='mt-1 text-[22px] leading-tight font-bold sm:text-[26px]'>
                  {t('Invite friends, earn {{percent}}% back', {
                    percent: rebatePercent,
                  })}
                </h3>
                <p className='text-muted-foreground mt-2 text-sm'>
                  {t(
                    'Friends who sign up with your code or link earn you a rebate on every top-up and redemption code they use.'
                  )}
                </p>
              </>
            ) : (
              <>
                <h3 className='text-[22px] leading-tight font-bold sm:text-[26px]'>
                  {t('Referral Program')}
                </h3>
                <p className='text-muted-foreground mt-2 text-sm'>
                  {t(
                    'Share your invitation link, or have friends enter your invitation code when they sign up.'
                  )}
                </p>
              </>
            )}
          </div>

          <div className='min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1'>
            <div className='text-muted-foreground text-sm'>
              {t('Total rebates')}
            </div>
            <div className='mt-1 text-4xl font-bold tracking-tight break-all tabular-nums sm:text-[44px] sm:leading-none'>
              {formatQuota(props.summary?.earned_quota ?? 0)}
            </div>
            <div className='border-brand/15 mt-4 flex gap-10 border-t pt-4 sm:gap-12'>
              <div className='min-w-0'>
                <div className='text-muted-foreground text-[13px]'>
                  {t('Arriving')}
                </div>
                <div className='mt-0.5 text-lg font-semibold break-all tabular-nums sm:text-xl'>
                  {formatQuota(props.summary?.pending_quota ?? 0)}
                </div>
              </div>
              <div className='min-w-0'>
                <div className='text-muted-foreground text-[13px]'>
                  {t('Invites')}
                </div>
                <div className='mt-0.5 text-lg font-semibold tabular-nums sm:text-xl'>
                  {props.summary?.invitee_count ?? props.user?.aff_count ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div className='min-w-0 space-y-2 lg:col-start-1'>
            <div className='flex flex-col gap-2 sm:flex-row sm:gap-2.5'>
              <Input
                aria-label={t('Invitation link')}
                value={props.affiliateLink}
                readOnly
                className='bg-background dark:bg-background h-12 min-w-0 flex-1 rounded-xl border-0 font-mono text-[13px]'
              />
              <CopyButton
                value={props.affiliateLink}
                variant='default'
                size='default'
                className='bg-brand hover:bg-brand-hover h-12 gap-2 rounded-xl px-5 font-semibold text-white'
                iconClassName='size-4'
                aria-label={t('Copy referral link')}
              >
                {t('Copy referral link')}
              </CopyButton>
            </div>
            <div className='text-muted-foreground flex items-center gap-1 text-sm'>
              <span className='shrink-0'>{t('Invitation code')}</span>
              <span className='text-foreground ml-1 min-w-0 truncate font-mono font-semibold tracking-widest'>
                {props.affiliateCode}
              </span>
              <CopyButton
                value={props.affiliateCode}
                className='text-brand-hover dark:text-brand-on-dark size-9'
                iconClassName='size-4'
                tooltip={t('Copy invitation code')}
                aria-label={t('Copy invitation code')}
              />
            </div>
          </div>
        </div>

        <section
          aria-label={t('How referral rebates work')}
          className='border-brand/15 border-t pt-5'
        >
          <h4 className='text-[13px] font-semibold'>
            {t('How referral rebates work')}
          </h4>
          {rebatePercent > 0 ? (
            <ol className='mt-3 grid gap-3 text-[13px] sm:grid-cols-3 sm:gap-6'>
              {[
                t(
                  'Share your invitation link, or have friends enter your invitation code when they sign up.'
                ),
                t(
                  'Every time a friend tops up or uses a redemption code, you earn {{percent}}% of it as a rebate.',
                  { percent: rebatePercent }
                ),
                arrivalStep,
              ].map((step, index) => (
                <li key={step} className='flex gap-2.5'>
                  <span className='bg-background text-brand-hover dark:text-brand-on-dark flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums'>
                    {index + 1}
                  </span>
                  <span className='text-muted-foreground'>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className='text-muted-foreground mt-1 text-[13px]'>
              {t(
                'Referral rebates are not open yet. Friends who sign up with your code still appear in your invitees.'
              )}
            </p>
          )}
        </section>

        {legacyRewards > 0 ? (
          <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
            <span className='text-muted-foreground'>
              {t(
                'Earlier invitation rewards of {{quota}} can be transferred to your balance.',
                { quota: formatQuota(legacyRewards) }
              )}
            </span>
            <Button
              onClick={props.onTransfer}
              disabled={!complianceConfirmed}
              className='h-8 shrink-0 px-3'
              size='sm'
            >
              {t('Transfer to Balance')}
            </Button>
          </div>
        ) : null}
        {!complianceConfirmed && legacyRewards > 0 ? (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Referral reward transfer is disabled until the administrator confirms compliance terms.'
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
