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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { WorkDownloadButton } from './work-download-button'

/**
 * Full-size view of a generated image, over its small version until it has
 * loaded.
 */
export function ImageViewer(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
  thumbnailUrl: string
  alt: string
  title: string
  details: string[]
  filename: string
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      description={props.details.filter(Boolean).join(' · ')}
      titleClassName='line-clamp-2 pr-8 leading-normal'
      contentClassName='sm:max-w-5xl'
    >
      {/* Mounted per opening, so the loading state starts over. */}
      <ViewedImage
        url={props.url}
        thumbnailUrl={props.thumbnailUrl}
        alt={props.alt}
        filename={props.filename}
      />
    </Dialog>
  )
}

function ViewedImage(props: {
  url: string
  thumbnailUrl: string
  alt: string
  filename: string
}) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // Asked for with CORS first: the CDN keeps the headers of its first answer,
  // and without them the download cannot read the image. Hosts that refuse
  // CORS are asked again plainly.
  const [plain, setPlain] = useState(false)

  return (
    <div className='bg-muted/40 rounded-card relative h-[72dvh] overflow-hidden'>
      {!loaded && (
        <img
          src={props.thumbnailUrl}
          alt=''
          className='absolute inset-0 size-full object-contain'
        />
      )}
      {!loaded && !failed && (
        <span className='absolute inset-0 flex items-center justify-center'>
          <Spinner className='size-6' aria-label={t('Loading')} />
        </span>
      )}
      {failed ? (
        <p className='bg-background/85 absolute inset-x-0 bottom-0 p-2 text-center text-xs'>
          {t('The image could not be loaded')}
        </p>
      ) : (
        <img
          key={plain ? 'plain' : 'cors'}
          src={props.url}
          alt={props.alt}
          crossOrigin={plain ? undefined : 'anonymous'}
          className={cn(
            'absolute inset-0 size-full object-contain',
            !loaded && 'opacity-0'
          )}
          onLoad={() => setLoaded(true)}
          onError={() => (plain ? setFailed(true) : setPlain(true))}
        />
      )}
      <WorkDownloadButton
        url={props.url}
        filename={props.filename}
        label={t('Download image')}
      />
    </div>
  )
}
