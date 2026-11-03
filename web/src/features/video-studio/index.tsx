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
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Composer } from './components/composer'
import { GalleryList } from './components/gallery-list'
import { ImageComposer } from './components/image-composer'
import { ImageWorksList } from './components/image-works-list'
import { WorksList } from './components/works-list'
import { STUDIO_WORKS_QUERY_KEY } from './constants'
import type { StudioDraft, StudioKind } from './types'

type WorksTab = 'mine' | 'gallery'

/** A past work loaded back into the composer of its kind. */
interface EditedWork {
  kind: StudioKind
  draft: Partial<StudioDraft>
  size?: string
  /** Changes on every load, so the composer starts over from the work. */
  key: number
}

/** Creation page: a prompt canvas for videos or images over the latest works. */
export function VideoStudio() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = useSearch({ from: '/_authenticated/video-studio/' })
  const navigate = useNavigate({ from: '/video-studio/' })
  const kind: StudioKind = search.kind ?? 'video'
  const [edited, setEdited] = useState<EditedWork | null>(null)
  const [worksTab, setWorksTab] = useState<WorksTab>('mine')
  const composerRef = useRef<HTMLElement>(null)
  const editWork = (draft: Partial<StudioDraft>, size?: string) => {
    setEdited((current) => ({
      kind,
      draft,
      size,
      key: (current?.key ?? 0) + 1,
    }))
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const editedDraft = edited?.kind === kind ? edited : null

  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-10 px-3 py-8 sm:px-4 md:py-12'>
          <section
            ref={composerRef}
            className='flex scroll-mt-4 flex-col items-center gap-5'
          >
            <h1 className='text-center text-2xl font-bold tracking-tight md:text-3xl'>
              {kind === 'image'
                ? t('Create an image, bring your ideas to life')
                : t('Create a video, bring your ideas to life')}
            </h1>
            <Tabs
              value={kind}
              onValueChange={(value) => {
                setEdited(null)
                navigate({
                  search: { kind: value as StudioKind },
                  replace: true,
                })
              }}
            >
              <TabsList>
                <TabsTrigger value='video'>{t('Video')}</TabsTrigger>
                <TabsTrigger value='image'>{t('Image')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className='w-full'>
              {kind === 'image' ? (
                <ImageComposer
                  key={editedDraft?.key}
                  initialModel={search.model}
                  initialDraft={editedDraft?.draft}
                  initialSize={editedDraft?.size}
                />
              ) : (
                <Composer
                  key={editedDraft?.key}
                  initialModel={search.model}
                  initialDraft={editedDraft?.draft}
                  onSubmitted={() =>
                    queryClient.invalidateQueries({
                      queryKey: STUDIO_WORKS_QUERY_KEY,
                    })
                  }
                />
              )}
            </div>
          </section>
          <section className='flex flex-col gap-4'>
            {kind === 'image' ? (
              <>
                <h2 className='text-lg font-semibold'>{t('My images')}</h2>
                <ImageWorksList onEdit={editWork} />
              </>
            ) : (
              <Tabs
                value={worksTab}
                onValueChange={(value) => setWorksTab(value as WorksTab)}
                className='gap-4'
              >
                <TabsList aria-label={t('Works sections')}>
                  <TabsTrigger value='mine'>{t('My videos')}</TabsTrigger>
                  <TabsTrigger value='gallery'>{t('Gallery')}</TabsTrigger>
                </TabsList>
                <TabsContent value='mine' className='flex flex-col gap-4'>
                  <WorksList onEdit={(draft) => editWork(draft)} />
                </TabsContent>
                <TabsContent value='gallery' className='flex flex-col gap-4'>
                  <GalleryList onReuse={(draft) => editWork(draft)} />
                </TabsContent>
              </Tabs>
            )}
          </section>
        </div>
      </div>
    </Main>
  )
}
