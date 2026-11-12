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

import { Button } from '@/components/ui/button'
import { useModelDisplayName } from '@/features/pricing/hooks'

interface UnavailableModelNoticeProps {
  reason?: string
  /** Available model to switch to; no switch is offered without one. */
  replacement?: string
  onSwitch: (name: string) => void
}

/** Why the picked model can't run now, with a switch to one that can. */
export function UnavailableModelNotice(props: UnavailableModelNoticeProps) {
  const { t } = useTranslation()
  const displayName = useModelDisplayName()
  const replacement = props.replacement
  return (
    <p
      role='status'
      className='text-warning mt-2 flex flex-wrap items-center gap-x-2 px-1 text-xs'
    >
      <span>
        {props.reason
          ? t('This model is temporarily unavailable: {{reason}}', {
              reason: props.reason,
            })
          : t('This model is temporarily unavailable. Pick another model.')}
      </span>
      {replacement && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-auto p-0 text-xs'
          onClick={() => props.onSwitch(replacement)}
        >
          {t('Switch to {{model}}', {
            model: displayName(replacement),
          })}
        </Button>
      )}
    </p>
  )
}
