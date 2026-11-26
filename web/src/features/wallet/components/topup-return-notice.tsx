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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { STUDIO_BALANCE_QUERY_KEY } from '@/features/video-studio/constants'
import { getSelf } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'

import { clearTopupStart, readTopupStart } from '../lib/topup-return'

const POLL_MS = 3000
/** After this the notice stops asking and says the credit can take longer. */
const WAIT_MS = 3 * 60 * 1000

const money = (quota: number) =>
  formatQuotaWithCurrency(quota, {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })

/**
 * Shown when the user comes back from paying: waits for the credit to arrive
 * and says how much did, or that a cancelled payment charged nothing.
 */
export function TopupReturnNotice(props: {
  status: 'success' | 'cancelled'
  /** What else the page keeps, such as the draft, said once it is safe. */
  keptNote?: string
  onRetry?: () => void
  onDismiss: () => void
  /** Lets the page refresh what it shows of the balance. */
  onArrived?: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [start] = useState(() => readTopupStart(Date.now()))
  const [openedAt] = useState(() => Date.now())
  const [waitedOut, setWaitedOut] = useState(false)
  const self = useQuery({
    queryKey: ['wallet', 'topup-return'],
    queryFn: async () => {
      const response = await getSelf()
      const quota = response?.data?.quota
      return typeof quota === 'number' ? quota : null
    },
    enabled: props.status === 'success',
    refetchInterval: (query) => {
      const quota = query.state.data
      const arrived = quota != null && start !== null && quota > start.quota
      return arrived || waitedOut ? false : POLL_MS
    },
    meta: { errorToast: false },
  })
  const quota = self.data ?? null
  const arrived =
    quota !== null && (start === null ? !self.isLoading : quota > start.quota)

  const { onArrived } = props
  useEffect(() => {
    if (!arrived || quota === null) return
    clearTopupStart()
    // The header and the composer read this balance; show the new one there.
    queryClient.setQueryData(STUDIO_BALANCE_QUERY_KEY, quota)
    onArrived?.()
  }, [arrived, quota, queryClient, onArrived])
  useEffect(() => {
    const timer = window.setTimeout(
      () => setWaitedOut(true),
      openedAt + WAIT_MS - Date.now()
    )
    return () => window.clearTimeout(timer)
  }, [openedAt])

  const dismiss = (
    <Button
      variant='ghost'
      size='icon-sm'
      className='absolute top-2 right-2'
      aria-label={t('Close')}
      onClick={props.onDismiss}
    >
      <X aria-hidden />
    </Button>
  )

  if (props.status === 'cancelled') {
    return (
      <Alert variant='warning' className='relative pr-12'>
        <AlertTitle>{t('Nothing was charged this time')}</AlertTitle>
        <AlertDescription className='text-current/80'>
          {[t('The payment was cancelled.'), props.keptNote]
            .filter(Boolean)
            .join(' ')}
          {props.onRetry && (
            <Button
              size='sm'
              variant='outline'
              className='mt-2'
              onClick={props.onRetry}
            >
              {t('Pay again')}
            </Button>
          )}
        </AlertDescription>
        {dismiss}
      </Alert>
    )
  }

  if (arrived && quota !== null) {
    return (
      <Alert variant='success' role='status' className='relative pr-12'>
        <CheckCircle2 aria-hidden />
        <AlertTitle>
          {start
            ? t('{{amount}} arrived. Balance {{balance}}', {
                amount: money(quota - start.quota),
                balance: money(quota),
              })
            : t('Balance {{balance}}', { balance: money(quota) })}
        </AlertTitle>
        {props.keptNote && (
          <AlertDescription className='text-current/80'>
            {props.keptNote}
          </AlertDescription>
        )}
        {dismiss}
      </Alert>
    )
  }

  return (
    <Alert variant='info' role='status' className='relative pr-12'>
      <Loader2
        className='animate-spin motion-reduce:animate-none'
        aria-hidden
      />
      <AlertTitle>
        {waitedOut
          ? t('The payment is not credited yet')
          : t('Payment received, confirming the credit')}
      </AlertTitle>
      <AlertDescription className='text-current/80'>
        {waitedOut
          ? t(
              'It can take a few more minutes. Your balance updates by itself; if it does not, contact support with your order.'
            )
          : t('This usually takes a few seconds.')}
      </AlertDescription>
      {dismiss}
    </Alert>
  )
}
