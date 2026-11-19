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
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { ShowcaseVideo } from '@/features/home/components/showcase-video'
import { useHeroClip } from '@/features/home/hooks/use-hero-clip'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

type AuthLayoutProps = {
  children: React.ReactNode
}

function SiteBrand(props: { className?: string }) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <Link
      to='/'
      className={cn(
        'flex items-center gap-2 transition-opacity hover:opacity-80',
        props.className
      )}
    >
      <div className='relative h-8 w-8'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-full' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-8 w-8 rounded-full object-cover'
          />
        )}
      </div>
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <span className='text-xl font-medium'>{systemName}</span>
      )}
    </Link>
  )
}

/** The product side of the sign-in pages: the home hero clip and what the site offers. */
function AuthShowcase() {
  const { t } = useTranslation()
  const hero = useHeroClip()
  const facts = [
    t('Up to 4K resolution'),
    t('4–30 seconds per clip'),
    t('Text, image or reference-video input'),
    t('Top up by card, use instantly'),
  ]

  return (
    <aside className='bg-ink relative hidden flex-col gap-10 overflow-hidden p-10 text-white lg:flex xl:p-14'>
      <div
        aria-hidden
        className='pointer-events-none absolute -top-40 -left-32 size-[32rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand)_35%,transparent),transparent_65%)]'
      />
      <SiteBrand className='relative' />
      <div className='relative my-auto flex flex-col gap-8'>
        <h2 className='font-display text-heading-1'>
          {t('Turn one sentence into')}{' '}
          <span className='text-brand-on-dark'>{t('cinematic video')}</span>
        </h2>
        <figure className='bg-ink-raised relative aspect-video overflow-hidden rounded-lg border border-white/10'>
          <ShowcaseVideo
            key={hero.video}
            src={hero.video}
            poster={hero.poster}
            label={hero.title || t('Video preview')}
            allowControls={false}
          />
        </figure>
        <ul className='grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-white/75'>
          {facts.map((fact) => (
            <li key={fact} className='flex items-center gap-2'>
              <Check
                className='text-brand-on-dark size-4 shrink-0'
                aria-hidden
              />
              {fact}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className='grid min-h-svh lg:grid-cols-2'>
      <AuthShowcase />
      <div className='relative flex flex-col'>
        <SiteBrand className='absolute top-4 left-4 z-10 sm:top-8 sm:left-8 lg:hidden' />
        <div className='container flex flex-1 items-center pt-16 sm:pt-0'>
          <div className='mx-auto flex w-full flex-col justify-center space-y-2 px-4 py-8 sm:w-[480px] sm:p-8'>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
