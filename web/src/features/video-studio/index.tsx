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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QuickTopupDialog } from '@/features/wallet/components/quick-topup-dialog'
import { TopupReturnNotice } from '@/features/wallet/components/topup-return-notice'
import { PX_SHOW_LINKS_ENABLED, pxShowUrl } from '@/lib/partner-links'
import { useAuthStore } from '@/stores/auth-store'
import { useStudioHandoff } from '@/stores/studio-handoff-store'

import { Composer } from './components/composer'
import { GalleryList } from './components/gallery-list'
import { ImageComposer } from './components/image-composer'
import { ImageWorksList } from './components/image-works-list'
import { NotifyOffer } from './components/notify-offer'
import { WorksList } from './components/works-list'
import { keepDraftAside, wouldLoseDraft } from './lib/draft-storage'
import type { StudioDraft, StudioKind } from './types'

type WorksTab = 'mine' | 'gallery'

/** A past work loaded back into the composer of its kind. */
interface EditedWork {
  kind: StudioKind
  draft: Partial<StudioDraft>
  size?: string
  pickModel?: boolean
  /** Changes on every load, so the composer starts over from the work. */
  key: number
}

/** Creation page: a prompt canvas for videos or images over the latest works. */
export function VideoStudio() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/_authenticated/video-studio/' })
  const navigate = useNavigate({ from: '/video-studio/' })
  const kind: StudioKind = search.kind ?? 'video'
  const userId = useAuthStore((state) => state.auth.user?.id)
  const handoff = useStudioHandoff((state) => state.handoff)
  const setHandoff = useStudioHandoff((state) => state.set)
  // A work another page sent here for editing; that page already asked.
  const [edited, setEdited] = useState<EditedWork | null>(() => {
    if (!handoff) return null
    // Before the composer saves the work over it, the draft goes aside.
    if (wouldLoseDraft(handoff.kind, userId, handoff.draft.prompt)) {
      keepDraftAside(handoff.kind, userId)
    }
    return { ...handoff, key: 1 }
  })
  const [replacing, setReplacing] = useState<Omit<EditedWork, 'key'> | null>(
    null
  )
  const [worksTab, setWorksTab] = useState<WorksTab>('mine')
  const [topupOpen, setTopupOpen] = useState(false)
  const composerRef = useRef<HTMLElement>(null)
  const worksRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (handoff) setHandoff(null)
  }, [handoff, setHandoff])

  const loadWork = (work: Omit<EditedWork, 'key'>) => {
    setEdited((current) => ({ ...work, key: (current?.key ?? 0) + 1 }))
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const editWork = (
    draft: Partial<StudioDraft>,
    size?: string,
    pickModel?: boolean
  ) => {
    const work = { kind, draft, size, pickModel }
    if (wouldLoseDraft(kind, userId, draft.prompt)) setReplacing(work)
    else loadWork(work)
  }
  const showSubmitted = () => {
    setWorksTab('mine')
    // After the new cards are drawn.
    requestAnimationFrame(() =>
      worksRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    )
  }
  const editedDraft = edited?.kind === kind ? edited : null

  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex w-full max-w-[1800px] flex-col gap-10 px-3 pt-6 pb-32 sm:px-4 md:py-10'>
          <section
            ref={composerRef}
            className='flex scroll-mt-4 flex-col items-center gap-5'
          >
            <h1 className='text-page-title text-center md:text-2xl'>
              {kind === 'image'
                ? t('Create an image, bring your ideas to life')
                : t('Create a video, bring your ideas to life')}
            </h1>
            {PX_SHOW_LINKS_ENABLED && (
              <a
                href={pxShowUrl('studio')}
                target='_blank'
                rel='noopener noreferrer'
                className='text-muted-foreground hover:text-foreground -mt-2 inline-flex items-center gap-1 text-center text-sm transition-colors'
              >
                {t('Making a multi-shot short drama? Try our partner PX Show')}
                <ArrowUpRight className='size-3.5 shrink-0' aria-hidden />
              </a>
            )}
            {search.topup && (
              <div className='w-full max-w-5xl'>
                <TopupReturnNotice
                  status={search.topup}
                  keptNote={t('Your draft is still here.')}
                  onRetry={() => setTopupOpen(true)}
                  onDismiss={() =>
                    navigate({
                      search: (previous) => ({ ...previous, topup: undefined }),
                      replace: true,
                    })
                  }
                />
              </div>
            )}
            {topupOpen && (
              <QuickTopupDialog
                open
                onOpenChange={setTopupOpen}
                returnPage='studio'
              />
            )}
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
            <div className='w-full max-w-5xl'>
              {kind === 'image' ? (
                <ImageComposer
                  key={editedDraft?.key}
                  initialModel={search.model}
                  initialDraft={editedDraft?.draft}
                  initialSize={editedDraft?.size}
                  onSubmitted={showSubmitted}
                />
              ) : (
                <Composer
                  key={editedDraft?.key}
                  initialModel={search.model}
                  initialDraft={editedDraft?.draft}
                  pickModel={editedDraft?.pickModel}
                  onSubmitted={showSubmitted}
                />
              )}
            </div>
          </section>
          <section ref={worksRef} className='flex scroll-mt-4 flex-col gap-4'>
            <NotifyOffer />
            {kind === 'image' ? (
              <>
                <h2 className='text-section-title'>{t('My images')}</h2>
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
                  <WorksList
                    onEdit={(draft, pickModel) =>
                      editWork(draft, undefined, pickModel)
                    }
                  />
                </TabsContent>
                <TabsContent value='gallery' className='flex flex-col gap-4'>
                  <GalleryList onReuse={(draft) => editWork(draft)} />
                </TabsContent>
              </Tabs>
            )}
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={replacing !== null}
        onOpenChange={(open) => {
          if (!open) setReplacing(null)
        }}
        title={t('Replace what you are writing?')}
        desc={t(
          'The current prompt has not been submitted. It is kept in Recent drafts, so you can bring it back.'
        )}
        cancelBtnText={t('Keep writing')}
        confirmText={t('Replace')}
        handleConfirm={() => {
          if (replacing) {
            keepDraftAside(replacing.kind, userId)
            loadWork(replacing)
          }
          setReplacing(null)
        }}
      />
    </Main>
  )
}
