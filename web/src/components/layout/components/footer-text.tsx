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
import {
  DiscordIcon,
  Link01Icon,
  Mail01Icon,
  NewTwitterIcon,
  TelegramIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import {
  type FooterIconService,
  parseFooterText,
} from '@/lib/plain-text-content'

const SERVICE_ICONS: Record<FooterIconService, typeof Link01Icon> = {
  x: NewTwitterIcon,
  telegram: TelegramIcon,
  discord: DiscordIcon,
  email: Mail01Icon,
  link: Link01Icon,
}

function externalProps(href: string) {
  return href.startsWith('mailto:')
    ? {}
    : { target: '_blank', rel: 'noopener noreferrer' }
}

/** Admin-written footer text laid out in the site's fixed footer style. */
export function FooterText(props: { text: string }) {
  const items = parseFooterText(props.text)
  const icons = items.filter((item) => item.kind === 'icon')

  return (
    <div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm sm:justify-start'>
      {items.map((item) => {
        if (item.kind === 'text') {
          return (
            <span key={item.text} className='text-muted-foreground'>
              {item.text}
            </span>
          )
        }
        if (item.kind === 'link') {
          return (
            <a
              key={item.href}
              href={item.href}
              {...externalProps(item.href)}
              className='text-foreground/80 hover:text-foreground whitespace-nowrap transition-colors'
            >
              {item.text}
            </a>
          )
        }
        return null
      })}
      {icons.length > 0 && (
        <span className='inline-flex items-center gap-2'>
          {icons.map((item) => (
            <a
              key={item.href}
              href={item.href}
              {...externalProps(item.href)}
              title={item.label}
              aria-label={item.label}
              className='border-border text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-[34px] items-center justify-center rounded-[10px] border transition-colors'
            >
              <HugeiconsIcon
                icon={SERVICE_ICONS[item.service]}
                className='size-4'
                aria-hidden
              />
            </a>
          ))}
        </span>
      )}
    </div>
  )
}
