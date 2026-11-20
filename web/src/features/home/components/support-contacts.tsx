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

import { SUPPORT_DISCORD_URL, SUPPORT_TELEGRAM } from '../lib/video-home'

/** Support channels: Telegram and the Discord community, open to every customer. */
export function SupportContacts() {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-1.5'>
      <p>{t('Contact us on whichever app is convenient for you:')}</p>
      <ul className='flex flex-col gap-1.5'>
        <li className='flex flex-wrap items-center gap-x-2'>
          <span>Telegram:</span>
          <a
            href={`https://t.me/${SUPPORT_TELEGRAM}`}
            target='_blank'
            rel='noopener noreferrer'
            className='text-foreground font-semibold'
          >
            @{SUPPORT_TELEGRAM}
          </a>
        </li>
        <li className='flex flex-wrap items-center gap-x-2'>
          <span>{t('Discord community')}:</span>
          <a
            href={SUPPORT_DISCORD_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='text-foreground font-semibold'
          >
            {SUPPORT_DISCORD_URL.replace(/^https:\/\//, '')}
          </a>
        </li>
      </ul>
    </div>
  )
}
