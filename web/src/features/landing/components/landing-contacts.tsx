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
import { ArrowUpRight, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconDiscord } from '@/assets/brand-icons'
import {
  SUPPORT_DISCORD_URL,
  SUPPORT_TELEGRAM,
} from '@/features/home/lib/video-home'
import { cn } from '@/lib/utils'

export function LandingContacts() {
  const { t } = useTranslation()

  const contacts = [
    {
      key: 'telegram',
      label: 'Telegram',
      value: `@${SUPPORT_TELEGRAM}`,
      href: `https://t.me/${SUPPORT_TELEGRAM}`,
      icon: Send,
      tone: 'border-brand-on-dark/35 hover:border-brand-on-dark/70',
      iconTone: 'bg-brand/20 text-brand-on-dark',
    },
    {
      key: 'discord',
      label: t('Discord community'),
      value: SUPPORT_DISCORD_URL.replace(/^https:\/\//, ''),
      href: SUPPORT_DISCORD_URL,
      icon: IconDiscord,
      tone: 'border-violet-400/35 hover:border-violet-400/70',
      iconTone: 'bg-violet-600/20 text-violet-400',
    },
  ]

  return (
    <div id='contact' className='flex flex-col gap-3'>
      <h2 className='text-heading-2 text-white'>{t('Contact us')}</h2>
      <p className='text-sm leading-relaxed text-white/60'>
        {t(
          'Questions about pricing, volume, top-ups or integration? Reach us on whichever app is convenient for you.'
        )}
      </p>
      <ul className='mt-1 flex flex-col gap-3'>
        {contacts.map((contact) => (
          <li key={contact.key}>
            <a
              href={contact.href}
              target='_blank'
              rel='noopener noreferrer'
              className={cn(
                'group flex items-center gap-3 rounded-xl border bg-ink-raised/60 px-4 py-3.5 backdrop-blur-sm transition-colors',
                contact.tone
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg',
                  contact.iconTone
                )}
              >
                <contact.icon className='size-5' aria-hidden />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-xs text-white/50'>
                  {contact.label}
                </span>
                <span className='block truncate font-mono text-sm text-white'>
                  {contact.value}
                </span>
              </span>
              <ArrowUpRight
                className='size-4 text-white/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white'
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
