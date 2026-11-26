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
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStudioBalance } from '@/features/video-studio/hooks/use-studio-balance'
import { formatQuotaWithCurrency } from '@/lib/currency'

/**
 * The wallet balance in the header, leading to the wallet. Compact drops the
 * icon to fit a phone's header.
 */
export function HeaderBalance(props: {
  className?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const balance = useStudioBalance(null)
  if (balance.quota === null) return null

  const amount = formatQuotaWithCurrency(balance.quota, {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })
  return (
    <Button
      variant='outline'
      size={props.compact ? 'xs' : 'sm'}
      className={props.className}
      nativeButton={false}
      render={<Link to='/wallet' />}
      aria-label={t('Balance {{amount}}, open the wallet', { amount })}
    >
      {!props.compact && <Wallet aria-hidden />}
      <span className='tabular-nums'>{amount}</span>
    </Button>
  )
}
