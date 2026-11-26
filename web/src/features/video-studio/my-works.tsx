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
import { Clapperboard, TriangleAlert, Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth-store'
import {
  useStudioHandoff,
  type StudioHandoff,
} from '@/stores/studio-handoff-store'

import { ImageWorksList } from './components/image-works-list'
import { WorksList } from './components/works-list'
import { IMAGE_RETENTION_DAYS, VIDEO_RETENTION_DAYS } from './constants'
import { useDownloadAll } from './hooks/use-download-all'
import { useExpiringWorks } from './hooks/use-expiring-works'
import { keepDraftAside, wouldLoseDraft } from './lib/draft-storage'
import type { WorkFilter } from './lib/work-retention'

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

  const [videoFilter, setVideoFilter] = useState<WorkFilter>('all')
  const bulk = useDownloadAll()
  const navigate = useNavigate()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const setHandoff = useStudioHandoff((state) => state.set)
  const [replacing, setReplacing] = useState<StudioHandoff | null>(null)
  const openInStudio = (work: StudioHandoff) => {
    setHandoff(work)
    void navigate({ to: '/video-studio', search: { kind: work.kind } })
  }
  const editWork = (work: StudioHandoff) => {
    if (wouldLoseDraft(work.kind, userId, work.draft.prompt)) setReplacing(work)
    else openInStudio(work)
  }

  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-3 py-8 sm:px-4'>
          <header className='flex flex-wrap items-end justify-between gap-3'>
            <div className='flex flex-col gap-1'>
              <h1 className='text-page-title'>{t('My works')}</h1>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Videos you create are kept for {{videoDays}} days and images for {{imageDays}} days. Download the ones you want to keep before they expire.',
                  {
                    videoDays: VIDEO_RETENTION_DAYS,
                    imageDays: IMAGE_RETENTION_DAYS,
                  }
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
            <Alert variant='warning'>
              <TriangleAlert aria-hidden />
              <AlertTitle>
                {t('{{value}} works expire soon', { value: expiring.total })}
              </AlertTitle>
              <AlertDescription className='text-current/80'>
                {t(
                  'Download the works marked with a countdown before they expire; expired works can no longer be played or downloaded.'
                )}
                <span className='mt-2 flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={bulk.progress !== null}
                    onClick={() => void bulk.downloadAll(expiring.works)}
                  >
                    <Download aria-hidden />
                    {bulk.progress
                      ? t('Downloading {{done}} / {{total}}', bulk.progress)
                      : t('Download all')}
                  </Button>
                  {expiring.videos > 0 && (
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setKind('video')
                        setVideoFilter('expiring')
                      }}
                    >
                      {t('Show only these')}
                    </Button>
                  )}
                </span>
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
                  <span className='bg-warning text-warning-foreground text-micro rounded-full px-1.5 leading-4'>
                    {expiring.videos}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value='image'>
                {t('Image')}
                {expiring.images > 0 && (
                  <span className='bg-warning text-warning-foreground text-micro rounded-full px-1.5 leading-4'>
                    {expiring.images}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value='video' className='flex flex-col gap-4'>
              <WorksList
                loadMore
                filter={videoFilter}
                onFilterChange={setVideoFilter}
                onEdit={(draft, pickModel) =>
                  editWork({ kind: 'video', draft, pickModel })
                }
              />
            </TabsContent>
            <TabsContent value='image' className='flex flex-col gap-4'>
              <ImageWorksList
                onEdit={(draft, size) =>
                  editWork({ kind: 'image', draft, size })
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(open) => {
          if (!open) setReplacing(null)
        }}
        title={t('Replace what you are writing?')}
        desc={t(
          'The prompt on the creation page has not been submitted. It is kept in Recent drafts, so you can bring it back.'
        )}
        cancelBtnText={t('Keep writing')}
        confirmText={t('Replace')}
        handleConfirm={() => {
          if (replacing) {
            keepDraftAside(replacing.kind, userId)
            openInStudio(replacing)
          }
          setReplacing(null)
        }}
      />
    </Main>
  )
}
