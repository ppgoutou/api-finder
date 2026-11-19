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
import { ArrowRight, Bolt, CreditCard, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { ShowcaseVideo } from '@/features/home/components/showcase-video'
import { useHomeShowcase } from '@/features/home/hooks/use-home-showcase'
import { useSeedancePricing } from '@/features/home/hooks/use-seedance-pricing'
import { useVideoSeriesPricing } from '@/features/home/hooks/use-video-series-pricing'
import { getHomeMediaUrl, HERO_VIDEO } from '@/features/home/lib/video-home'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

const GRADIENT_TEXT =
  'bg-gradient-to-r from-brand-on-dark via-cyan-400 to-violet-400 bg-clip-text text-transparent'

export function LandingHero() {
  const { t } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const { bestDiscount } = useSeedancePricing()
  const seriesList = useVideoSeriesPricing()
  const configured = useHomeShowcase().hero
  // Same clip as the home page hero: the admin-uploaded one, else the built-in.
  const hero = configured.video
    ? configured
    : {
        title: t(HERO_VIDEO.title),
        prompt: t(HERO_VIDEO.prompt),
        spec: HERO_VIDEO.spec,
        video: getHomeMediaUrl(`${HERO_VIDEO.name}.mp4`),
        poster: getHomeMediaUrl(`${HERO_VIDEO.name}.jpg`),
      }
  // The Seedance 2.0 series is the cheaper one, so its lowest price is the
  // entry price.
  const entryRow = seriesList.find(
    (series) => series.name === 'Seedance 2.0'
  )?.lowest
  const entryPrice = entryRow?.approximate
    ? `≈${entryRow.price}`
    : entryRow?.price

  const points = [
    {
      icon: Sparkles,
      text: t('Text-to-video · Image-to-video · Reference video'),
    },
    { icon: Bolt, text: t('Pay as you go, no subscription or minimum spend') },
    { icon: CreditCard, text: t('Top up by card or code, use instantly') },
  ]
  const stats = [
    { value: '4K', label: t('Max resolution') },
    { value: t('{{seconds}}s', { seconds: 30 }), label: t('Max clip length') },
    entryPrice
      ? { value: entryPrice, label: t('Per second, from') }
      : { value: t('Per second'), label: t('Billed by generated seconds') },
    { value: '2.0 / 2.5', label: t('Seedance models') },
  ]

  return (
    <section className='mx-auto flex max-w-6xl flex-col px-4 pb-10 md:px-6 2xl:max-w-7xl'>
      <header className='flex h-16 items-center justify-between gap-3'>
        <span className='flex min-w-0 items-center gap-2.5 font-semibold text-white'>
          <img
            src={logo || '/logo.png'}
            alt=''
            className='size-7 shrink-0 rounded-md'
          />
          <span className='truncate'>{systemName || 'API-Finder'}</span>
        </span>
        <div className='flex items-center gap-2'>
          <LanguageSwitcher />
          <Button
            className='group bg-brand hover:bg-brand-hover rounded-lg border-0 text-white shadow-[0_0_20px_color-mix(in_oklch,var(--brand)_45%,transparent)]'
            render={<Link to='/' />}
          >
            {t('Go to website')}
            <ArrowRight
              className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5'
              aria-hidden
            />
          </Button>
        </div>
      </header>

      <div className='grid grid-cols-[minmax(0,1fr)] items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:py-12 2xl:py-16'>
        <div className='landing-animate-fade-up opacity-0'>
          <p className='border-brand-on-dark/35 bg-brand/10 text-brand-on-dark inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs tracking-wide'>
            <span
              className='bg-brand-on-dark size-1.5 animate-pulse rounded-full shadow-[0_0_8px_var(--brand-on-dark)]'
              aria-hidden
            />
            {t('Seedance AI video · online')}
          </p>
          {/* Three lines from lg up: the lead line never wraps there. */}
          <h1 className='font-display text-heading-1 mt-5 text-white'>
            <span className='lg:whitespace-nowrap'>
              {t('Cinematic AI video,')}
            </span>
            <br />
            <span className={GRADIENT_TEXT}>
              {bestDiscount
                ? t('{{percentOff}}% below official price', bestDiscount)
                : t('billed per second')}
            </span>
          </h1>
          <p className='mt-5 max-w-xl text-base leading-relaxed text-white/60 2xl:text-lg'>
            {t(
              'Create cinematic video with ByteDance Seedance right in your browser, or add it to your own app with our video API. Billed per generated second.'
            )}
          </p>
          <ul className='mt-6 flex flex-col gap-2.5 text-sm text-white/75'>
            {points.map((point) => (
              <li key={point.text} className='flex items-center gap-2.5'>
                <point.icon className='text-brand-on-dark size-4' aria-hidden />
                {point.text}
              </li>
            ))}
          </ul>
        </div>

        <figure
          className='landing-animate-fade-up from-brand-on-dark/80 rounded-2xl bg-gradient-to-br via-cyan-400/25 to-violet-400/80 p-px opacity-0 shadow-[0_0_60px_rgba(59,130,246,0.25)]'
          style={{ animationDelay: '120ms' }}
        >
          <div className='bg-ink relative aspect-video overflow-hidden rounded-[15px]'>
            <ShowcaseVideo
              key={hero.video}
              src={hero.video}
              poster={hero.poster}
              label={hero.title || t('Video preview')}
              eager
            />
            {hero.spec && (
              <span className='bg-ink/70 absolute top-3 left-3 rounded-md border border-white/15 px-2 py-0.5 font-mono text-xs text-white/90'>
                {hero.spec}
              </span>
            )}
            <span className='bg-ink/70 text-brand-on-dark absolute top-3 right-3 rounded-md px-2 py-0.5 font-mono text-xs'>
              ● {t('Generated')}
            </span>
            {hero.prompt && (
              <figcaption className='bg-ink/85 absolute inset-x-3 bottom-3 truncate rounded-lg border border-white/10 px-3 py-2 font-mono text-xs text-white/85 backdrop-blur-sm'>
                <span className='text-violet-400'>prompt&gt;</span>{' '}
                {hero.prompt}
              </figcaption>
            )}
          </div>
        </figure>
      </div>

      <dl className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        {stats.map((stat) => (
          <div
            key={stat.label}
            className='bg-ink-raised/60 flex flex-col-reverse rounded-xl border border-white/10 px-4 py-3 backdrop-blur-sm'
          >
            <dt className='mt-1 text-xs text-white/50'>{stat.label}</dt>
            <dd
              className={cn('font-mono text-2xl font-semibold', GRADIENT_TEXT)}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
