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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { usePayment } from '../hooks/use-payment'
import { useTopupAmountNote } from '../hooks/use-topup-amount-note'
import { useTopupInfo } from '../hooks/use-topup-info'
import { useTopupUnits } from '../hooks/use-topup-units'
import { getMinTopupAmount } from '../lib'
import type { PaymentMethod } from '../types'
import { PaymentConfirmDialog } from './dialogs/payment-confirm-dialog'

/**
 * Tops up the wallet without leaving the page: pick an amount and a method,
 * confirm what is paid, and come back to `returnPage` afterwards. Methods that
 * need their own steps stay in the wallet, which the dialog links to.
 */
export function QuickTopupDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How much is missing, in USD, to say what the user is topping up for. */
  shortfallUSD?: number | null
  returnPage: 'wallet' | 'studio'
}) {
  const { t } = useTranslation()
  const { topupInfo, presetAmounts, loading } = useTopupInfo()
  const units = useTopupUnits()
  const noteFor = useTopupAmountNote(units)
  const payment = usePayment()
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<PaymentMethod>()
  const [confirming, setConfirming] = useState(false)
  const methods = (topupInfo?.pay_methods ?? []).filter((item) => !item.paused)
  const minTopup = getMinTopupAmount(topupInfo)
  // The smallest preset that covers what is missing, else the first one.
  const covering = presetAmounts.find(
    (preset) =>
      props.shortfallUSD != null &&
      units.toUSD(preset.value) >= props.shortfallUSD
  )
  const chosen = amount ?? covering?.value ?? presetAmounts[0]?.value ?? null
  const chosenMethod = method ?? methods[0]
  const formatCredit = (value: number) =>
    formatLocalCurrencyAmount(value * units.creditExchangeRate, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })

  const pay = async () => {
    if (chosen === null || !chosenMethod) return
    const payable = await payment.calculatePaymentAmount(
      chosen,
      chosenMethod.type
    )
    if (payable > 0) setConfirming(true)
  }

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Top up and keep creating')}
        description={
          props.shortfallUSD != null
            ? t('Your draft is saved and comes back after you pay.')
            : undefined
        }
        contentClassName='sm:max-w-lg'
      >
        {loading && <Skeleton className='h-48 w-full' />}
        {!loading && methods.length === 0 && (
          <p className='text-muted-foreground text-sm'>
            {t('Top up in the wallet.')}
          </p>
        )}
        {!loading && methods.length > 0 && (
          <div className='flex flex-col gap-4'>
            <div
              role='radiogroup'
              aria-label={t('Amount')}
              className='grid grid-cols-2 gap-2 sm:grid-cols-3'
            >
              {presetAmounts.slice(0, 6).map((preset) => {
                const selected = preset.value === chosen
                const note = noteFor(preset.value)
                return (
                  <Button
                    key={preset.value}
                    type='button'
                    role='radio'
                    aria-checked={selected}
                    variant='outline'
                    disabled={preset.value < minTopup}
                    className={cn(
                      'h-auto flex-col gap-0.5 py-3',
                      selected &&
                        'border-primary bg-brand-soft text-primary dark:bg-primary/15 border-2'
                    )}
                    onClick={() => setAmount(preset.value)}
                  >
                    <span className='text-lg font-semibold tabular-nums'>
                      {formatCredit(preset.value)}
                    </span>
                    {note && (
                      <span className='text-muted-foreground text-caption font-normal'>
                        {note}
                      </span>
                    )}
                  </Button>
                )
              })}
            </div>
            {methods.length > 1 && (
              <div
                role='radiogroup'
                aria-label={t('Payment Method')}
                className='grid grid-cols-2 gap-2'
              >
                {methods.map((item) => (
                  <Button
                    key={item.type}
                    type='button'
                    role='radio'
                    aria-checked={item.type === chosenMethod?.type}
                    variant='outline'
                    className={cn(
                      'h-11',
                      item.type === chosenMethod?.type &&
                        'border-primary text-primary border-2'
                    )}
                    onClick={() => setMethod(item)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            )}
            <Button
              size='xl'
              disabled={
                chosen === null || payment.calculating || payment.processing
              }
              onClick={() => void pay()}
            >
              {chosen !== null && chosenMethod
                ? t('Pay {{amount}} with {{method}}', {
                    amount: formatCredit(chosen),
                    method: chosenMethod.name,
                  })
                : t('Pay')}
            </Button>
          </div>
        )}
        <Button
          variant='link'
          size='sm'
          className='self-center'
          nativeButton={false}
          render={<Link to='/wallet' />}
        >
          {t('More ways to top up in the wallet')}
        </Button>
      </Dialog>
      <PaymentConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => {
          if (chosen === null || !chosenMethod) return
          void payment.processPayment(
            chosen,
            chosenMethod.type,
            props.returnPage
          )
        }}
        topupAmount={chosen ?? 0}
        paymentAmount={payment.amount}
        paymentMethod={chosenMethod}
        calculating={payment.calculating}
        processing={payment.processing}
        discountRate={
          chosen === null ? undefined : topupInfo?.discount?.[chosen]
        }
        usdExchangeRate={units.creditExchangeRate}
        usdtActiveOrderExpiresAt={payment.usdtActiveOrderExpiresAt}
      />
    </>
  )
}
