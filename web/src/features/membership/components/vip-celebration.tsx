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
import { CheckmarkCircle02Icon, CrownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { useMembership } from '../hooks/use-membership'
import { getVipBenefits } from '../lib/benefits'
import { vipCelebrationKey } from '../lib/vip-celebration'
import { VIP_GOLD_FILL } from '../lib/vip-style'
import { VipSupportContact } from './vip-support-contact'

/**
 * Welcomes a member to VIP the first time this browser sees them as VIP,
 * such as right after the top-up that upgraded them.
 */
export function VipCelebration() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id ?? 0)
  const { data: info } = useMembership({ signedInOnly: true })
  const [open, setOpen] = useState(false)
  const isVip = info?.is_vip === true

  useEffect(() => {
    if (!isVip || userId <= 0) return
    const key = vipCelebrationKey(userId)
    try {
      if (window.localStorage.getItem(key)) return
      window.localStorage.setItem(key, String(Date.now()))
    } catch {
      // Without storage the welcome would show on every visit, so skip it.
      return
    }
    trackEvent('vip_celebration_shown')
    setOpen(true)
  }, [isVip, userId])

  if (!info || !isVip) return null
  const benefits = getVipBenefits(info, t)

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      contentClassName='sm:max-w-md'
      title={
        <span className='flex flex-col items-center gap-3 text-center'>
          <span className='flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/40'>
            <HugeiconsIcon icon={CrownIcon} className='size-7' aria-hidden />
          </span>
          {t('Welcome to VIP!')}
        </span>
      }
      headerClassName='items-center text-center'
      description={t(
        'Your top-ups reached the VIP threshold, and your VIP benefits are already on.'
      )}
      descriptionClassName='text-center'
      footer={
        <Button
          className={cn('w-full font-semibold', VIP_GOLD_FILL)}
          render={<Link to='/video-studio' onClick={() => setOpen(false)} />}
        >
          {t('Start creating')}
        </Button>
      }
    >
      <ul className='grid gap-2'>
        {benefits.slice(0, 4).map((benefit) => (
          <li key={benefit.id} className='flex items-center gap-2 text-sm'>
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className='size-4 shrink-0 text-amber-500'
              aria-hidden
            />
            {benefit.title}
          </li>
        ))}
      </ul>
      <div className='mt-4'>
        <VipSupportContact handle={info.vip_support_telegram} />
      </div>
    </Dialog>
  )
}
