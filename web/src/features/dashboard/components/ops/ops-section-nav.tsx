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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export interface OpsNavItem {
  id: string
  index: number
  label: string
}

/**
 * Jump links to the dashboard sections. It stays at the top of the page while
 * it scrolls and marks the section being read.
 */
export function OpsSectionNav(props: { items: OpsNavItem[] }) {
  const { t } = useTranslation()
  const navRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(props.items[0]?.id)

  useEffect(() => {
    let frame = 0
    // The current section is the last one whose top has scrolled under the
    // navigation bar. The page scrolls inside the layout, so every scroll is
    // watched, not only the window's.
    const update = () => {
      frame = 0
      const line = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 32
      let current = props.items[0]?.id
      for (const item of props.items) {
        const element = document.getElementById(item.id)
        if (element && element.getBoundingClientRect().top <= line) {
          current = item.id
        }
      }
      // The last section may be too short to reach the bar; once the page
      // has scrolled to its end, it is the one being read.
      const last = props.items.at(-1)
      const lastElement = last ? document.getElementById(last.id) : null
      if (
        last &&
        lastElement &&
        lastElement.getBoundingClientRect().bottom <= window.innerHeight + 4
      ) {
        current = last.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    update()
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [props.items])

  return (
    // The negative top cancels the layout's top padding, which sticky
    // positioning keeps clear, so no content shows above the bar.
    <nav
      ref={navRef}
      aria-label={t('Dashboard sections')}
      className='bg-background sticky -top-1 z-30 sm:-top-1.5 -mx-1 overflow-x-auto px-1 py-2'
    >
      <ol className='flex w-max gap-1.5'>
        {props.items.map((item) => {
          const current = item.id === active
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? 'location' : undefined}
                onClick={() => setActive(item.id)}
                className={cn(
                  'rounded-control flex items-center gap-1.5 border px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  current
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <span className='font-mono text-xs tabular-nums'>
                  {item.index}
                </span>
                {item.label}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
