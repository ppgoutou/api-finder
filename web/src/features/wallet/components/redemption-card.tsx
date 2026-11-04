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
import { ExternalLink, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { cn } from '@/lib/utils'

import {
  REDEMPTION_ORDERS_URL,
  WALLET_CARD_HEADER_CLASS,
  WALLET_HEADER_ACTION_CLASS,
  WALLET_SURFACE_CLASS,
} from '../constants'

interface RedemptionCardProps {
  /** Where codes are sold (the admin's top-up link); hides the buy panel when empty. */
  topupLink?: string
  /** False until the administrator confirms the payment compliance terms. */
  redemptionEnabled: boolean
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  loading?: boolean
}

export function RedemptionCard(props: RedemptionCardProps) {
  const { t } = useTranslation()
  const purchaseSteps = [
    {
      title: t('Place an order in the shop'),
      detail: t('Pay with WeChat Pay or Alipay'),
    },
    {
      title: t('Receive the code automatically'),
      detail: t('Shown on the order page'),
    },
    {
      title: t('Come back and redeem'),
      detail: t('Credit is added right away'),
    },
  ]

  // A full skeleton, header included, so the card does not show up ahead of
  // the recharge card next to it while top-up info loads.
  if (props.loading) {
    return (
      <Card
        data-card-hover='false'
        data-testid='redemption-card-skeleton'
        className={cn(
          'h-full gap-0 overflow-hidden py-0',
          WALLET_SURFACE_CLASS
        )}
      >
        <CardHeader className={WALLET_CARD_HEADER_CLASS}>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-4 sm:p-6'>
          <Skeleton className='h-48 w-full rounded-lg' />
          <Skeleton className='h-28 w-full rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  return (
    <TitledCard
      title={t('Redemption Code Top-up')}
      description={t('Buy with WeChat Pay or Alipay, delivered automatically')}
      disableHoverEffect
      className={cn('h-full', WALLET_SURFACE_CLASS)}
      headerClassName={WALLET_CARD_HEADER_CLASS}
      inlineAction
      action={
        <a
          href={REDEMPTION_ORDERS_URL}
          target='_blank'
          rel='noopener noreferrer'
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            WALLET_HEADER_ACTION_CLASS
          )}
        >
          {t('Redemption Records')}
        </a>
      }
      contentClassName='flex flex-1 flex-col gap-5 p-4 sm:p-6'
    >
      <>
        {props.topupLink && (
          <ol className='grid gap-2.5 sm:grid-cols-3 sm:gap-4'>
            {purchaseSteps.map((step, index) => (
              <li
                key={step.title}
                className='flex gap-2.5 sm:flex-col sm:gap-1'
              >
                <span className='text-brand dark:text-brand-on-dark text-[13px] font-bold'>
                  {index + 1}
                </span>
                <span className='flex min-w-0 flex-col gap-0.5'>
                  <span className='text-sm font-semibold'>{step.title}</span>
                  <span className='text-muted-foreground text-[13px]'>
                    {step.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {props.redemptionEnabled ? (
          <div
            className={cn(
              'space-y-2',
              props.topupLink && 'border-t border-border/60 pt-4'
            )}
          >
            <Label
              htmlFor='redemption-code'
              className='text-muted-foreground text-[13px] font-normal'
            >
              {t('Enter redemption code')}
            </Label>
            <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2.5'>
              <Input
                id='redemption-code'
                value={props.redemptionCode}
                onChange={(e) => props.onRedemptionCodeChange(e.target.value)}
                placeholder={t('Paste your redemption code')}
                className='bg-muted h-11 min-w-0 border-0'
              />
              <Button
                variant='secondary'
                onClick={props.onRedeem}
                disabled={props.redeeming}
                className='text-foreground h-11 px-4 font-semibold sm:px-5'
              >
                {props.redeeming && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {t('Redeem')}
              </Button>
            </div>
            <p className='text-muted-foreground text-[13px]'>
              {t('Credit never expires after redeeming')}
            </p>
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              {t(
                'Redemption codes are disabled until the administrator confirms compliance terms.'
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* mt-auto lines this up with the payment button of the card beside it. */}
        {props.topupLink && (
          <a
            href={props.topupLink}
            target='_blank'
            rel='noopener noreferrer'
            className={cn(
              buttonVariants(),
              'bg-brand hover:bg-brand-hover mt-auto h-13 gap-2 rounded-xl text-base font-semibold text-white'
            )}
          >
            {t('Buy redemption code')}
            <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
          </a>
        )}
      </>
    </TitledCard>
  )
}
