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
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useSegmentedDownload } from '@/hooks/use-segmented-download'

/** Stays a real link, so new tabs and download managers still work. */
export function WorkDownloadButton(props: { url: string; filename: string }) {
  const { t } = useTranslation()
  const download = useSegmentedDownload(props.url, props.filename)
  const busy = download.percent !== null

  return (
    <Button
      variant='secondary'
      size='icon'
      className='absolute top-2 right-2 size-8 rounded-full text-[10px] font-semibold tabular-nums opacity-90'
      nativeButton={false}
      render={<a href={props.url} download={props.filename} />}
      onClick={download.onClick}
      aria-label={busy ? t('Downloading') : t('Download video')}
      aria-busy={busy}
    >
      {busy ? (
        `${download.percent}%`
      ) : (
        <Download className='size-4' aria-hidden />
      )}
    </Button>
  )
}
