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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getUsdtExceptionReceipts,
  resolveUsdtExceptionReceipt,
  type UsdtExceptionReceipt,
} from './usdt-api'

const USDT_EXCEPTIONS_QUERY_KEY = ['usdt-exception-receipts']

/**
 * Transfers the gateway reported that could not be credited on their own: ones
 * no order claims, and ones a full wallet refused. Handling them is manual.
 */
export function UsdtExceptionReceipts() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [resolving, setResolving] = useState<UsdtExceptionReceipt | null>(null)
  const [note, setNote] = useState('')

  const receipts = useQuery({
    queryKey: USDT_EXCEPTIONS_QUERY_KEY,
    queryFn: getUsdtExceptionReceipts,
  })

  const resolve = useMutation({
    mutationFn: (input: { id: number; note: string }) =>
      resolveUsdtExceptionReceipt(input.id, input.note),
    onSuccess: () => {
      toast.success(t('Marked as handled'))
      setResolving(null)
      setNote('')
      void queryClient.invalidateQueries({
        queryKey: USDT_EXCEPTIONS_QUERY_KEY,
      })
    },
    onError: (error) => handleServerError(error),
  })

  const items = receipts.data ?? []

  return (
    <div className='space-y-3'>
      <div>
        <h4 className='font-medium'>{t('Transfers needing attention')}</h4>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Transfers with no matching order, and credits refused by the wallet limit. Refused credits retry on their own until marked as handled.'
          )}
        </p>
      </div>

      {items.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t('No transfers need attention')}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border'>
          {items.map((receipt) => (
            <li
              key={receipt.id}
              className='flex flex-wrap items-center justify-between gap-3 p-3'
            >
              <div className='min-w-0 space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>{receipt.amount} USDT</span>
                  <StatusBadge
                    label={
                      receipt.status === 'unmatched'
                        ? t('No matching order')
                        : t('Credit refused')
                    }
                    variant='warning'
                    copyable={false}
                  />
                  {receipt.user_id > 0 && (
                    <span className='text-muted-foreground text-xs'>
                      {t('User ID')}: {receipt.user_id}
                    </span>
                  )}
                </div>
                <div className='text-muted-foreground flex items-center gap-1 text-xs'>
                  <span className='truncate font-mono'>{receipt.tx_hash}</span>
                  <CopyButton value={receipt.tx_hash} />
                </div>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setResolving(receipt)}
              >
                {t('Mark as handled')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={resolving !== null}
        onOpenChange={(open) => {
          if (!open) setResolving(null)
        }}
        title={t('Mark this transfer as handled?')}
        desc={t(
          'This does not add any quota. Credit the user yourself if they are owed it.'
        )}
        confirmText={t('Mark as handled')}
        isLoading={resolve.isPending}
        handleConfirm={() => {
          if (resolving) resolve.mutate({ id: resolving.id, note })
        }}
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='usdt-exception-note'>{t('Note')}</Label>
          <Input
            id='usdt-exception-note'
            maxLength={255}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
