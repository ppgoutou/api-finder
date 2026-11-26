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
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStudioBalance } from '@/features/video-studio/hooks/use-studio-balance'
import { useTypicalVideoCost } from '@/features/video-studio/hooks/use-typical-video-cost'
import { handoffFromPrompt } from '@/features/video-studio/lib/prompt-handoff'
import { formatQuotaWithCurrency, getCurrencyDisplay } from '@/lib/currency'
import { useStudioHandoff } from '@/stores/studio-handoff-store'

/**
 * The creator's start: a prompt that opens the creation page with it, and
 * the balance with about how many videos it pays for.
 */
export function QuickStartPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setHandoff = useStudioHandoff((state) => state.set)
  const [prompt, setPrompt] = useState('')
  const balance = useStudioBalance(null)
  const video = useTypicalVideoCost()

  const start = (event: React.FormEvent) => {
    event.preventDefault()
    if (prompt.trim()) setHandoff(handoffFromPrompt(prompt.trim()))
    void navigate({ to: '/video-studio' })
  }

  let videos: number | null = null
  if (balance.quota !== null && video) {
    const balanceUSD = balance.quota / getCurrencyDisplay().config.quotaPerUnit
    videos = Math.floor(balanceUSD / video.costUSD)
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
      <form
        onSubmit={start}
        className='bg-card rounded-card flex flex-col gap-3 border p-4 sm:p-5'
      >
        <label htmlFor='quick-start-prompt' className='text-section-title'>
          {t('What do you want to make today?')}
        </label>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Input
            id='quick-start-prompt'
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t(
              'For example: a rainy city at night, people walking by with umbrellas'
            )}
            className='h-11 flex-1'
          />
          <Button type='submit' size='xl'>
            {t('Start creating')}
            <ArrowRight data-icon='inline-end' aria-hidden />
          </Button>
        </div>
        <ol className='text-muted-foreground grid gap-1 text-sm sm:grid-cols-3'>
          <li>{t('1. Write a sentence or add an image')}</li>
          <li>{t('2. Pick a model and check the fee')}</li>
          <li>{t('3. Download it from My works in a few minutes')}</li>
        </ol>
      </form>
      <div className='bg-card rounded-card flex flex-col justify-between gap-3 border p-4 sm:p-5'>
        <div>
          <p className='text-muted-foreground text-sm'>{t('Balance')}</p>
          <p className='text-metric tabular-nums'>
            {balance.quota === null
              ? '-'
              : formatQuotaWithCurrency(balance.quota, {
                  digitsLarge: 2,
                  digitsSmall: 2,
                  abbreviate: false,
                })}
          </p>
          {videos !== null && videos > 0 && video && (
            <p className='text-muted-foreground text-sm'>
              {t('About {{count}} videos at {{resolution}}, {{seconds}}s', {
                count: videos,
                resolution: video.resolution,
                seconds: video.seconds,
              })}
            </p>
          )}
        </div>
        <Button
          variant='outline'
          nativeButton={false}
          render={<Link to='/wallet' />}
        >
          <Wallet data-icon='inline-start' aria-hidden />
          {t('Top up')}
        </Button>
      </div>
    </div>
  )
}
