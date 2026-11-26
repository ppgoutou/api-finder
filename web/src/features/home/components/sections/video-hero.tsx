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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { handoffFromPrompt } from '@/features/video-studio/lib/prompt-handoff'
import { useStudioHandoff } from '@/stores/studio-handoff-store'

import { useHeroClip } from '../../hooks/use-hero-clip'
import { useSeedancePricing } from '../../hooks/use-seedance-pricing'
import { ShowcaseVideo } from '../showcase-video'

interface VideoHeroProps {
  isAuthenticated?: boolean
}

export function VideoHero(props: VideoHeroProps) {
  const { t } = useTranslation()
  const { bestDiscount } = useSeedancePricing()
  const hero = useHeroClip()
  const startTarget = props.isAuthenticated ? '/video-studio' : '/sign-up'
  // Guests sign up first and are then sent on to the page.
  const startSearch = props.isAuthenticated ? {} : { redirect: '/video-studio' }
  const setHandoff = useStudioHandoff((state) => state.set)

  const facts = [
    t('Up to 4K resolution'),
    t('4–30 seconds per clip'),
    t('Text, image or reference-video input'),
    t('Top up by card, use instantly'),
  ]

  return (
    <section className='cinema-shutter bg-ink relative z-10 flex min-h-[100svh] flex-col justify-end overflow-hidden text-white'>
      {/* The clip fills the first screen; the copy sits on top of it. */}
      <div className='absolute inset-0'>
        <ShowcaseVideo
          key={hero.video}
          src={hero.video}
          poster={hero.poster}
          label={hero.title || t('Video preview')}
          eager
          soundToggle
          allowControls={false}
          className='cinema-push'
          soundToggleClassName='top-24 right-4 z-[3] md:right-6'
        />
      </div>
      {/* Shade so the header and copy stay readable over any frame. */}
      <div
        aria-hidden
        className='from-ink/80 pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent'
      />
      <div
        aria-hidden
        className='from-ink via-ink/70 pointer-events-none absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t to-transparent'
      />
      <div
        aria-hidden
        className='from-ink/60 pointer-events-none absolute inset-y-0 left-0 hidden w-2/3 bg-gradient-to-r to-transparent md:block'
      />

      <div className='relative z-[3] mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-6 pt-36 pb-20 md:gap-6 md:pb-24'>
        <p className='landing-animate-fade-up border-brand-on-dark/30 bg-brand/15 text-brand-on-dark inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium opacity-0 backdrop-blur-sm'>
          <span
            className='bg-brand-on-dark size-1.5 rounded-full'
            aria-hidden
          />
          {t('Seedance 2.5 is live · up to 30 seconds per clip')}
        </p>
        <h1
          className='landing-animate-fade-up font-display text-heading-1 max-w-3xl opacity-0'
          style={{ animationDelay: '60ms' }}
        >
          {t('Turn one sentence into')}{' '}
          <span className='cinema-shimmer'>{t('cinematic video')}</span>
        </h1>
        <p
          className='landing-animate-fade-up max-w-xl text-base leading-relaxed text-white/75 opacity-0 md:text-lg'
          style={{ animationDelay: '120ms' }}
        >
          {t(
            'An AI video creation platform powered by ByteDance Seedance. Turn a prompt, an image or a reference clip into a finished video in the browser, billed by the second.'
          )}
          {bestDiscount && (
            <>
              {' '}
              <strong className='font-semibold text-white'>
                {t('{{percentOff}}% off official prices', bestDiscount)}
              </strong>
            </>
          )}
        </p>
        <div
          className='landing-animate-fade-up flex flex-wrap gap-3 opacity-0'
          style={{ animationDelay: '180ms' }}
        >
          <Button
            className='cinema-glow group h-12 rounded-xl px-6 text-base font-semibold'
            render={<Link to={startTarget} search={startSearch} />}
          >
            {props.isAuthenticated
              ? t('Open Video Creation')
              : t('Sign up free and start creating')}
            <ArrowRight
              className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5'
              aria-hidden
            />
          </Button>
          <Button
            variant='outline'
            className='h-12 rounded-xl border-white/25 bg-white/5 px-6 text-base text-white backdrop-blur-sm hover:bg-white/10 hover:text-white'
            render={<a href='#pricing' />}
          >
            {t('View Pricing')}
          </Button>
        </div>
        <ul className='flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs tracking-wide text-white/60 uppercase'>
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {hero.prompt && (
          <div className='bg-ink/60 flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 px-4 py-3 backdrop-blur-sm'>
            <span className='bg-brand/25 text-brand-on-dark rounded-md px-2 py-0.5 text-xs font-semibold'>
              {t('Prompt used')}
            </span>
            <span className='min-w-0 flex-[1_1_18rem] truncate text-sm text-white/90'>
              {hero.prompt}
            </span>
            <Link
              to={startTarget}
              search={startSearch}
              onClick={() =>
                setHandoff(handoffFromPrompt(hero.prompt, hero.spec))
              }
              className='hover:text-brand-on-dark text-sm font-semibold text-white'
            >
              {t('Try this prompt')} →
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
