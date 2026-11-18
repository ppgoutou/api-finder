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
import { Clapperboard, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ImageWorksList } from './components/image-works-list'
import { WorksList } from './components/works-list'
import { MEDIA_RETENTION_DAYS } from './constants'
import { useExpiringWorks } from './hooks/use-expiring-works'

type WorksKind = 'video' | 'image'

/**
 * Everything the user created in the studio, videos and images, with a
 * reminder when some of them are about to expire.
 */
export function MyWorks() {
  const { t } = useTranslation()
  const expiring = useExpiringWorks()
  const [kind, setKind] = useState<WorksKind>(() =>
    expiring.videos === 0 && expiring.images > 0 ? 'image' : 'video'
  )

  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-3 py-8 sm:px-4'>
          <header className='flex flex-wrap items-end justify-between gap-3'>
            <div className='flex flex-col gap-1'>
              <h1 className='text-2xl font-bold tracking-tight'>
                {t('My works')}
              </h1>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Videos and images you create are kept for {{days}} days. Download the ones you want to keep before they expire.',
                  { days: MEDIA_RETENTION_DAYS }
                )}
              </p>
            </div>
            <Button
              variant='outline'
              render={<Link to='/video-studio' />}
              nativeButton={false}
            >
              <Clapperboard aria-hidden />
              {t('Create')}
            </Button>
          </header>
          {expiring.total > 0 && (
            <Alert className='border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'>
              <TriangleAlert aria-hidden />
              <AlertTitle>
                {t('{{value}} works expire soon', { value: expiring.total })}
              </AlertTitle>
              <AlertDescription className='text-current/80'>
                {t(
                  'Download the works marked with a countdown before they expire; expired works can no longer be played or downloaded.'
                )}
              </AlertDescription>
            </Alert>
          )}
          <Tabs
            value={kind}
            onValueChange={(value) => setKind(value as WorksKind)}
            className='gap-4'
          >
            <TabsList aria-label={t('Works sections')}>
              <TabsTrigger value='video'>
                {t('Video')}
                {expiring.videos > 0 && (
                  <span className='rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 text-white'>
                    {expiring.videos}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value='image'>
                {t('Image')}
                {expiring.images > 0 && (
                  <span className='rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 text-white'>
                    {expiring.images}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value='video' className='flex flex-col gap-4'>
              <WorksList loadMore />
            </TabsContent>
            <TabsContent value='image' className='flex flex-col gap-4'>
              <ImageWorksList />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Main>
  )
}
