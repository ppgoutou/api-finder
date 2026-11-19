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
import { Link, useRouter } from '@tanstack/react-router'
import { Clapperboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NotFoundError() {
  const { t } = useTranslation()
  const { history } = useRouter()
  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center'>
        <h1 className='text-brand dark:text-brand-on-dark font-display text-display tabular-nums'>
          404
        </h1>
        <span className='font-medium'>{t('Oops! Page Not Found!')}</span>
        <p className='text-muted-foreground'>
          {t("It seems like the page you're looking for")} <br />
          {t('does not exist or might have been removed.')}
        </p>
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          <Link
            to='/video-studio'
            className={cn(
              buttonVariants(),
              'bg-brand hover:bg-brand-hover h-11 px-5 text-white'
            )}
          >
            <Clapperboard data-icon='inline-start' aria-hidden />
            {t('Open Video Creation')}
          </Link>
          <Link
            to='/'
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
          >
            {t('Back to Home')}
          </Link>
          <Button
            variant='ghost'
            className='h-11 px-4'
            onClick={() => history.go(-1)}
          >
            {t('Go Back')}
          </Button>
        </div>
      </div>
    </div>
  )
}
