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
import { cn } from '@/lib/utils'
import { useStudioHandoff } from '@/stores/studio-handoff-store'

import { useHeroClip } from '../../hooks/use-hero-clip'
import { useSeedancePricing } from '../../hooks/use-seedance-pricing'
import { ShowcaseVideo } from '../showcase-video'

interface VideoHeroProps {
  isAuthenticated?: boolean
}

export function VideoHero(props: VideoHeroProps) {
  const { t, i18n } = useTranslation()
  // Chinese and Japanese headlines are short enough to sit on one line on
  // wide screens; other languages keep wrapping at a smaller size.
  const isCjk = /^(zh|ja)/i.test(i18n.resolvedLanguage || i18n.language || '')
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

      <div className='relative z-[3] mx-auto flex w-full max-w-7xl flex-col items-start gap-5 px-6 pt-36 pb-16 md:px-8 md:pb-20'>
        <p className='landing-animate-fade-up text-micro inline-flex items-center gap-2 font-mono tracking-[0.12em] text-white/55 uppercase opacity-0'>
          <span className='cinema-rec size-1.5 rounded-full' aria-hidden />
          {t('Seedance 2.5 is live · up to 30 seconds per clip')}
        </p>
        <h1
          className={cn(
            'landing-animate-fade-up font-display tracking-tight text-balance uppercase opacity-0',
            isCjk
              ? 'text-[clamp(2.75rem,12.5vw,4rem)] leading-[1.15] sm:text-[clamp(4rem,11vw,5.5rem)] lg:text-[clamp(5.5rem,8vw,7rem)] lg:leading-[1.1] 2xl:w-max 2xl:text-[clamp(6rem,5.8vw,6.875rem)]'
              : 'text-display max-w-6xl leading-[1.02] 2xl:text-[clamp(6rem,5.2vw,8rem)]'
          )}
          style={{ animationDelay: '60ms' }}
        >
          <span className={cn('block', isCjk && '2xl:inline')}>
            {t('Turn one sentence into')}
          </span>{' '}
          <span className={cn('cinema-shimmer block', isCjk && '2xl:inline')}>
            {t('cinematic video')}
          </span>
        </h1>
        <p
          className='landing-animate-fade-up max-w-lg text-sm leading-relaxed text-white/55 opacity-0'
          style={{ animationDelay: '120ms' }}
        >
          {t(
            'AI video from a prompt, an image or a reference clip, billed by the second.'
          )}
          {bestDiscount && (
            <>
              {' '}
              <strong className='font-semibold text-white/85'>
                {t('{{percentOff}}% off official prices', bestDiscount)}
              </strong>
            </>
          )}
        </p>
        <div
          className='landing-animate-fade-up mt-2 flex flex-wrap items-center gap-3 opacity-0'
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
            variant='ghost'
            className='h-12 rounded-xl px-4 text-sm text-white/65 hover:bg-white/5 hover:text-white'
            render={<a href='#pricing' />}
          >
            {t('View Pricing')}
          </Button>
        </div>
        <ul className='text-micro flex flex-wrap gap-x-5 gap-y-1.5 font-mono tracking-wide text-white/35 uppercase'>
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {hero.prompt && (
          <div className='mt-4 flex w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-4 text-xs'>
            <span className='text-micro font-mono tracking-wide text-white/40 uppercase'>
              {t('Prompt used')}
            </span>
            <span className='min-w-0 flex-[1_1_14rem] truncate text-white/50'>
              {hero.prompt}
            </span>
            <Link
              to={startTarget}
              search={startSearch}
              onClick={() =>
                setHandoff(handoffFromPrompt(hero.prompt, hero.spec))
              }
              className='hover:text-brand-on-dark font-medium text-white/75'
            >
              {t('Try this prompt')} →
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
