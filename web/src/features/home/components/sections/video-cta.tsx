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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'

interface VideoCtaProps {
  isAuthenticated?: boolean
}

export function VideoCta(props: VideoCtaProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className='relative z-10 px-6 pb-16 md:pb-20'>
      <AnimateInView
        animation='scale-in'
        className='border-brand/30 bg-brand-soft mx-auto flex max-w-5xl flex-col items-center gap-4 rounded-3xl border px-8 py-14 text-center'
      >
        <h2 className='text-heading-2'>{t('Write your first prompt')}</h2>
        <p className='text-muted-foreground max-w-md'>
          {t('Sign up, top up, and generate your first video.')}
        </p>
        <Button
          className='mt-2 h-12 rounded-xl px-7 text-base font-semibold'
          render={<Link to='/sign-up' />}
        >
          {t('Sign up free')}
        </Button>
      </AnimateInView>
    </section>
  )
}
