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
import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
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
      <Card data-card-hover='false' className='bg-muted/20 py-0'>
        <CardContent className='grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.72fr)_minmax(320px,1.15fr)] lg:items-center'>
          <div>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='mt-2 h-4 w-48' />
          </div>
          <Skeleton className='h-14 rounded-lg' />
          <Skeleton className='h-10 rounded-lg' />
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
    <Card data-card-hover='false' className='bg-muted/20 py-0'>
      <CardContent className='grid gap-3 p-3 sm:gap-4 sm:p-4'>
        <div className='grid gap-3 sm:gap-4 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.65fr)_minmax(280px,1fr)] lg:items-center'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <IconBadge tone='chart-3'>
              <Share2 />
            </IconBadge>
            <div className='min-w-0'>
              <h3 className='truncate text-sm font-semibold'>
                {t('Referral Program')}
              </h3>
              <p className='text-muted-foreground line-clamp-2 text-xs'>
                {rebatePercent > 0
                  ? t(
                      'Friends who sign up with your code or link earn you {{percent}}% of every top-up and redemption code they use.',
                      { percent: rebatePercent }
                    )
                  : t(
                      'Share your invitation link, or have friends enter your invitation code when they sign up.'
                    )}
              </p>
            </div>
          </div>

          <div className='grid grid-cols-3 gap-1.5 text-center'>
            {[
              [t('Arriving'), formatQuota(props.summary?.pending_quota ?? 0)],
              [
                t('Total rebates'),
                formatQuota(props.summary?.earned_quota ?? 0),
              ],
              [
                t('Invites'),
                String(
                  props.summary?.invitee_count ?? props.user?.aff_count ?? 0
                ),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
                  {label}
                </div>
                <div className='mt-0.5 truncate text-sm font-semibold tabular-nums'>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className='grid gap-2'>
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground shrink-0 text-xs'>
                {t('Invitation code')}
              </span>
              <span className='min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-widest'>
                {props.affiliateCode}
              </span>
              <CopyButton
                value={props.affiliateCode}
                variant='outline'
                className='bg-background size-9 shrink-0'
                iconClassName='size-4'
                tooltip={t('Copy invitation code')}
                aria-label={t('Copy invitation code')}
              />
            </div>
            <div className='flex items-center gap-2'>
              <Input
                aria-label={t('Invitation link')}
                value={props.affiliateLink}
                readOnly
                className='border-muted bg-background/70 h-9 min-w-0 flex-1 font-mono text-xs'
              />
              <CopyButton
                value={props.affiliateLink}
                variant='outline'
                className='bg-background size-9 shrink-0'
                iconClassName='size-4'
                tooltip={t('Copy referral link')}
                aria-label={t('Copy referral link')}
              />
            </div>
          </div>
        </div>

        <section
          aria-label={t('How referral rebates work')}
          className='bg-background/60 rounded-lg border p-3'
        >
          <h4 className='text-xs font-semibold'>
            {t('How referral rebates work')}
          </h4>
          {rebatePercent > 0 ? (
            <ol className='mt-2 grid gap-2 text-xs sm:grid-cols-3'>
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
                <li key={step} className='flex gap-2'>
                  <span className='bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums'>
                    {index + 1}
                  </span>
                  <span className='text-muted-foreground'>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className='text-muted-foreground mt-1 text-xs'>
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
