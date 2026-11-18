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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Footer } from '@/components/layout/components/footer'
import { getSavedInterfaceLanguage } from '@/i18n/languages'

import { LandingContacts } from './components/landing-contacts'
import { LandingHero } from './components/landing-hero'
import { LandingPricing } from './components/landing-pricing'

/**
 * Standalone Seedance campaign page: always dark, English unless the
 * visitor picked a language, with one link to the main site and no site navigation.
 */
export function Landing() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const root = document.documentElement
    const previousTheme = root.classList.contains('dark') ? 'dark' : 'light'
    root.classList.remove('light')
    root.classList.add('dark')
    return () => {
      root.classList.remove('dark')
      root.classList.add(previousTheme)
    }
  }, [])

  // The campaign page is English unless the visitor picked a language; leaving
  // it hands the rest of the site back to the browser language.
  useEffect(() => {
    if (getSavedInterfaceLanguage()) return
    void i18n.changeLanguage('en')
    return () => {
      if (getSavedInterfaceLanguage()) return
      void i18n.changeLanguage()
    }
  }, [i18n])

  return (
    <div className='bg-ink relative flex min-h-svh flex-col overflow-hidden text-white/85'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] [background-size:32px_32px]'
      />
      <div
        aria-hidden
        className='pointer-events-none absolute -top-48 -left-40 size-[36rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.32),transparent_65%)]'
      />
      <div
        aria-hidden
        className='pointer-events-none absolute top-24 -right-48 size-[40rem] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.24),transparent_65%)]'
      />
      <div
        aria-hidden
        className='pointer-events-none absolute top-[110svh] left-1/3 size-[40rem] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_65%)]'
      />
      <div className='relative flex flex-1 flex-col'>
        <LandingHero />
        <section className='mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-16 md:px-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] 2xl:max-w-7xl'>
          <LandingPricing />
          <LandingContacts />
        </section>
        <Footer className='mt-auto border-white/10' />
      </div>
    </div>
  )
}
