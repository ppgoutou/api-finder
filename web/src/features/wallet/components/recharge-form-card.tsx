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
import { Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  PAYMENT_TYPES,
  WALLET_CARD_HEADER_CLASS,
  WALLET_HEADER_ACTION_CLASS,
  WALLET_SURFACE_CLASS,
} from '../constants'
import { getDiscountLabel, getPaymentIcon, getMinTopupAmount } from '../lib'
import type {
  PaymentMethod,
  PresetAmount,
  TopupInfo,
  CreemProduct,
  WaffoPayMethod,
} from '../types'
import { CreemProductsSection } from './creem-products-section'
import { StripeAcceptedMethods } from './stripe-accepted-methods'

interface RechargeFormCardProps {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  topupAmount: number
  onTopupAmountChange: (amount: number) => void
  onPaymentMethodSelect: (method: PaymentMethod) => void
  paymentLoading: string | null
  loading?: boolean
  /** Converts an entered amount to the displayed credit; 1 for yuan amounts. */
  usdExchangeRate?: number
  /** Currency of entered amounts; undefined when quota is shown as tokens. */
  amountUnit?: 'USD' | 'CNY'
  onOpenBilling?: () => void
  creemProducts?: CreemProduct[]
  enableCreemTopup?: boolean
  onCreemProductSelect?: (product: CreemProduct) => void
  enableWaffoTopup?: boolean
  waffoPayMethods?: WaffoPayMethod[]
  onWaffoMethodSelect?: (method: WaffoPayMethod, index: number) => void
  enableWaffoPancakeTopup?: boolean
}

export function RechargeFormCard({
  topupInfo,
  presetAmounts,
  selectedPreset,
  onSelectPreset,
  topupAmount,
  onTopupAmountChange,
  onPaymentMethodSelect,
  paymentLoading,
  loading,
  usdExchangeRate = 1,
  amountUnit,
  onOpenBilling,
  creemProducts,
  enableCreemTopup,
  onCreemProductSelect,
  enableWaffoTopup,
  waffoPayMethods,
  onWaffoMethodSelect,
  enableWaffoPancakeTopup,
}: RechargeFormCardProps) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(topupAmount.toString())

  useEffect(() => {
    // Empty string must survive, otherwise the field can never be cleared
    setLocalAmount((prev) =>
      prev === '' && topupAmount === 0 ? prev : topupAmount.toString()
    )
  }, [topupAmount])

  // Top-up amounts are whole units: keep the leading digits only, so a pasted
  // "12.5" becomes 12 and signs or exponents never reach the amount.
  const handleAmountChange = (value: string) => {
    const digits = /^\d*/.exec(value)?.[0] ?? ''
    setLocalAmount(digits)
    onTopupAmountChange(Number.parseInt(digits, 10) || 0)
  }

  const hasStandardPaymentMethods =
    Array.isArray(topupInfo?.pay_methods) && topupInfo.pay_methods.length > 0
  // A paused method alone still shows the amounts and its disabled button.
  const hasConfigurableTopup =
    hasStandardPaymentMethods ||
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    topupInfo?.enable_usdt_topup ||
    enableWaffoTopup ||
    enableWaffoPancakeTopup
  const hasAnyTopup = hasConfigurableTopup || enableCreemTopup
  const primaryMethod = topupInfo?.pay_methods?.find((item) => !item.paused)
  const stripeMethodIndex =
    topupInfo?.pay_methods?.findIndex(
      (item) => item.type === PAYMENT_TYPES.STRIPE && !item.paused
    ) ?? -1
  // With exactly two methods each button is one column, so the logos can sit
  // under the Stripe button on wide screens.
  const stripeHasOwnColumn = topupInfo?.pay_methods?.length === 2
  const hasWaffoPaymentMethods =
    Array.isArray(waffoPayMethods) && waffoPayMethods.length > 0
  const minTopup = getMinTopupAmount(topupInfo)
  const belowMinTopup = localAmount !== '' && topupAmount < minTopup
  const formatCredit = (amount: number) =>
    formatLocalCurrencyAmount(amount * usdExchangeRate, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })
  let customAmountLabel = t('Custom Amount')
  if (amountUnit === 'USD') customAmountLabel = t('Custom amount (USD)')
  if (amountUnit === 'CNY') customAmountLabel = t('Custom amount (CNY)')

  if (loading) {
    return (
      <Card
        data-card-hover='false'
        className={cn('gap-0 overflow-hidden py-0', WALLET_SURFACE_CLASS)}
      >
        <CardHeader className={WALLET_CARD_HEADER_CLASS}>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-4 sm:space-y-6 sm:p-6'>
          <div className='space-y-4 sm:space-y-6'>
            {/* Preset Amounts Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-16' />
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                {Array.from({ length: 8 }, (_, index) => `preset-${index}`).map(
                  (key) => (
                    <Skeleton key={key} className='h-[72px] rounded-lg' />
                  )
                )}
              </div>
            </div>

            {/* Custom Amount Input Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-28' />
              <Skeleton className='h-[42px] w-full' />
            </div>

            {/* Payment Methods Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-32' />
              <div className='flex flex-wrap gap-3'>
                {['primary', 'secondary', 'tertiary'].map((key) => (
                  <Skeleton key={key} className='h-10 w-24 rounded-lg' />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <TitledCard
      title={t('Online Top-up')}
      description={t('Pay online and the credit arrives right away')}
      disableHoverEffect
      className={cn('h-full', WALLET_SURFACE_CLASS)}
      headerClassName={WALLET_CARD_HEADER_CLASS}
      inlineAction
      action={
        onOpenBilling ? (
          <Button
            variant='ghost'
            size='sm'
            onClick={onOpenBilling}
            className={WALLET_HEADER_ACTION_CLASS}
          >
            {t('Order History')}
          </Button>
        ) : null
      }
      contentClassName='flex flex-1 flex-col gap-4 p-4 sm:gap-5 sm:p-6'
    >
      {/* Online Topup Section */}
      {hasAnyTopup ? (
        <div className='flex flex-1 flex-col gap-4 sm:gap-6'>
          {hasConfigurableTopup && (
            <>
              <div className='flex flex-1 flex-col gap-2.5 sm:gap-3'>
                <div className='grid flex-1 auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5'>
                  {/* The sixth tile is the custom amount, so at most five presets show. */}
                  {presetAmounts.slice(0, 5).map((preset) => {
                    const discount =
                      preset.discount ||
                      topupInfo?.discount?.[preset.value] ||
                      1.0
                    const hasDiscount = discount < 1
                    return (
                      <Button
                        key={preset.value}
                        variant='ghost'
                        aria-pressed={selectedPreset === preset.value}
                        className={cn(
                          'flex h-full min-h-[60px] flex-col items-center justify-center rounded-xl px-3 py-2.5 text-center whitespace-normal sm:min-h-[68px]',
                          selectedPreset === preset.value
                            ? 'bg-brand/15 text-brand-hover hover:bg-brand/20 hover:text-brand-hover dark:text-brand-on-dark dark:hover:text-brand-on-dark'
                            : 'bg-muted hover:bg-muted/70'
                        )}
                        onClick={() => onSelectPreset(preset)}
                      >
                        <div className='flex w-full items-center justify-center gap-2'>
                          <div className='text-lg font-bold tabular-nums sm:text-xl'>
                            {formatCredit(preset.value)}
                          </div>
                          {hasDiscount && (
                            <div className='text-success text-xs font-medium'>
                              {getDiscountLabel(discount, t)}
                            </div>
                          )}
                        </div>
                        {amountUnit === 'USD' && (
                          <div className='text-muted-foreground mt-1.5 w-full text-xs sm:mt-2'>
                            {t('{{amount}} USD credit', {
                              amount: formatNumber(preset.value),
                            })}
                          </div>
                        )}
                      </Button>
                    )
                  })}
                  <Input
                    id='topup-amount'
                    type='number'
                    aria-label={customAmountLabel}
                    value={selectedPreset === null ? localAmount : ''}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (['.', ',', 'e', 'E', '-', '+'].includes(e.key)) {
                        e.preventDefault()
                      }
                    }}
                    min={minTopup}
                    step={1}
                    inputMode='numeric'
                    aria-invalid={belowMinTopup}
                    aria-describedby={
                      belowMinTopup ? 'topup-amount-error' : undefined
                    }
                    placeholder={t('Custom Amount')}
                    className={cn(
                      'h-full min-h-[60px] rounded-xl border-0 px-3 text-center text-base font-semibold sm:min-h-[68px]',
                      selectedPreset === null && topupAmount > 0
                        ? 'bg-brand/15 text-brand-hover dark:bg-brand/15 dark:text-brand-on-dark'
                        : 'bg-muted dark:bg-muted'
                    )}
                  />
                </div>
                {belowMinTopup && (
                  <p
                    id='topup-amount-error'
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {t('Minimum topup amount: {{amount}}', {
                      amount: minTopup,
                    })}
                  </p>
                )}
              </div>

              <div className='space-y-2.5 sm:space-y-3'>
                {hasStandardPaymentMethods ? (
                  <div
                    className={cn(
                      'grid gap-2 sm:gap-2.5',
                      (topupInfo?.pay_methods?.length ?? 0) > 1 && 'grid-cols-2'
                    )}
                  >
                    {topupInfo?.pay_methods?.map((method) => {
                      const isPrimary = method === primaryMethod
                      const belowMethodMin = minTopup > topupAmount
                      const disabled = method.paused || belowMethodMin
                      const payLabel =
                        topupAmount > 0 && !method.paused
                          ? t('Pay {{amount}} with {{method}}', {
                              amount: formatCredit(topupAmount),
                              method: method.name,
                            })
                          : method.name
                      let disabledReason: string | undefined
                      let disabledLabel: string | undefined
                      if (method.paused) {
                        disabledReason = t('Temporarily unavailable')
                        disabledLabel = disabledReason
                      } else if (belowMethodMin) {
                        disabledReason = t('Minimum topup amount: {{amount}}', {
                          amount: minTopup,
                        })
                        disabledLabel = `${t('Minimum:')} ${minTopup}`
                      }

                      const button = (
                        <Button
                          key={method.type}
                          variant={isPrimary ? 'default' : 'secondary'}
                          onClick={() => onPaymentMethodSelect(method)}
                          disabled={disabled || !!paymentLoading}
                          title={disabledReason}
                          aria-label={
                            disabledReason
                              ? `${payLabel}. ${disabledReason}`
                              : payLabel
                          }
                          className={cn(
                            'min-h-13 min-w-0 gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold sm:gap-2 sm:px-3 sm:text-base',
                            isPrimary
                              ? 'bg-brand hover:bg-brand-hover text-white'
                              : 'text-foreground'
                          )}
                        >
                          {paymentLoading === method.type && (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          )}
                          {paymentLoading !== method.type &&
                            getPaymentIcon(
                              method.type,
                              'h-4 w-4',
                              method.icon,
                              method.name,
                              isPrimary
                            )}
                          <span className='flex min-w-0 flex-col items-center gap-0.5'>
                            <span className='max-w-full truncate'>
                              {method.name}
                            </span>
                            {disabledLabel && (
                              <span className='max-w-full truncate text-[11px] leading-4 font-normal opacity-80'>
                                {disabledLabel}
                              </span>
                            )}
                          </span>
                        </Button>
                      )

                      return disabled ? (
                        <TooltipProvider key={method.type}>
                          <Tooltip>
                            <TooltipTrigger render={button} />
                            <TooltipContent>{disabledReason}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        button
                      )
                    })}
                  </div>
                ) : null}
                {stripeMethodIndex >= 0 && (
                  <div
                    className={cn(
                      'grid',
                      stripeHasOwnColumn && 'sm:grid-cols-2 sm:gap-2.5'
                    )}
                  >
                    <StripeAcceptedMethods
                      className={cn(
                        stripeHasOwnColumn &&
                          stripeMethodIndex === 1 &&
                          'sm:col-start-2'
                      )}
                      labelClassName={
                        stripeHasOwnColumn ? 'sm:hidden' : undefined
                      }
                    />
                  </div>
                )}
                {!hasStandardPaymentMethods && !hasWaffoPaymentMethods && (
                  <Alert>
                    <AlertDescription>
                      {t(
                        'No payment methods available. Please contact administrator.'
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {enableWaffoTopup &&
                hasWaffoPaymentMethods &&
                onWaffoMethodSelect && (
                  <div className='space-y-2.5 sm:space-y-3'>
                    <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                      {t('Waffo Payment')}
                    </Label>
                    <div className='grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3'>
                      {waffoPayMethods?.map((method, index) => {
                        const loadingKey = `waffo-${index}`
                        const methodKey = `${method.payMethodType ?? 'unknown'}-${method.payMethodName ?? method.name}`
                        const belowMin = minTopup > topupAmount
                        const disabledReason = belowMin
                          ? t('Minimum topup amount: {{amount}}', {
                              amount: minTopup,
                            })
                          : undefined
                        const disabledLabel = belowMin
                          ? `${t('Minimum:')} ${minTopup}`
                          : undefined

                        let methodIcon = getPaymentIcon('waffo')
                        if (paymentLoading === loadingKey) {
                          methodIcon = (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          )
                        } else if (method.icon) {
                          methodIcon = (
                            <img
                              src={method.icon}
                              alt={method.name}
                              className='h-4 w-4 object-contain'
                            />
                          )
                        }

                        const button = (
                          <Button
                            key={methodKey}
                            variant='outline'
                            onClick={() => onWaffoMethodSelect(method, index)}
                            disabled={belowMin || !!paymentLoading}
                            title={disabledReason}
                            aria-label={
                              disabledReason
                                ? `${method.name}. ${disabledReason}`
                                : method.name
                            }
                            className='min-h-14 min-w-0 justify-start gap-2 rounded-lg px-3 py-2 text-left'
                          >
                            {methodIcon}
                            <span className='flex min-w-0 flex-col items-start gap-0.5'>
                              <span className='max-w-full truncate'>
                                {method.name}
                              </span>
                              {disabledLabel && (
                                <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                  {disabledLabel}
                                </span>
                              )}
                            </span>
                          </Button>
                        )

                        return belowMin ? (
                          <TooltipProvider key={methodKey}>
                            <Tooltip>
                              <TooltipTrigger render={button} />
                              <TooltipContent>{disabledReason}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          button
                        )
                      })}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      ) : (
        <Alert>
          <AlertDescription>
            {t(
              'Online topup is not enabled. Please use redemption code or contact administrator.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Creem Products Section */}
      {enableCreemTopup &&
        Array.isArray(creemProducts) &&
        creemProducts.length > 0 &&
        onCreemProductSelect && (
          <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
            <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Creem Payment')}
            </Label>
            <CreemProductsSection
              products={creemProducts}
              onProductSelect={onCreemProductSelect}
            />
          </div>
        )}
    </TitledCard>
  )
}
