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
import { History } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatTimestamp } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { readRecentDrafts, type SavedDraft } from '../lib/draft-storage'
import { localizeMentions } from '../lib/mention-names'
import type { StudioKind } from '../types'

/** Drafts that were replaced or cleared, to load one of them again. */
export function RecentDrafts(props: {
  kind: StudioKind
  onRestore: (draft: SavedDraft) => void
}) {
  const { t, i18n } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  // Read when the menu opens, since other actions change the list.
  const [drafts, setDrafts] = useState<SavedDraft[]>([])

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          setDrafts(
            readRecentDrafts(props.kind, userId, Math.floor(Date.now() / 1000))
          )
        }
      }}
    >
      <DropdownMenuTrigger
        render={<Button type='button' variant='ghost' size='xs' />}
      >
        <History aria-hidden />
        {t('Recent drafts')}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-80 max-w-[calc(100vw-1.5rem)]'
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('Recent drafts')}</DropdownMenuLabel>
          {drafts.length === 0 && (
            <p className='text-muted-foreground px-2 py-1.5 text-xs'>
              {t('Drafts you replace or clear are kept here.')}
            </p>
          )}
          {drafts.map((recent) => (
            <DropdownMenuItem
              key={`${recent.savedAt}-${recent.draft.prompt}`}
              className='flex flex-col items-start gap-0.5'
              onClick={() => props.onRestore(recent)}
            >
              <span className='line-clamp-2 text-sm'>
                {localizeMentions(
                  recent.draft.prompt,
                  i18n.resolvedLanguage || i18n.language
                )}
              </span>
              {recent.savedAt && (
                <span className='text-muted-foreground text-caption tabular-nums'>
                  {formatTimestamp(recent.savedAt)}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
