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
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'

import { DEFAULT_DRAFT } from '../constants'
import { useStudioPricer } from '../hooks/use-studio-price'
import { draftFromVideoRequest } from '../lib/draft'
import type { VideoTaskRequest } from '../types'

/** Asks before a past request is submitted, and charged, once more. */
export function RegenerateDialog(props: {
  request: VideoTaskRequest
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const price = useStudioPricer()({
    ...DEFAULT_DRAFT,
    ...draftFromVideoRequest(props.request),
  })

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('Generate this video again?')}
      desc={
        price
          ? t(
              'The same prompt and settings are used. Estimated fee: {{fee}}.',
              {
                fee: price.label,
              }
            )
          : t('The same prompt and settings are used, as a new charged task.')
      }
      confirmText={t('Generate again')}
      handleConfirm={props.onConfirm}
    />
  )
}
