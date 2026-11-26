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

import { canPlayHomeMotion } from '../lib/home-motion'

type ScanState = 'waiting' | 'scanning' | 'done'

/**
 * Laid over a clip: the first time the clip scrolls into view, a glowing line
 * sweeps across it and clears a blur, as if the video were being generated.
 * Then it removes itself. Without motion it never shows.
 */
export function GenerationScan() {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<ScanState>(() =>
    canPlayHomeMotion() ? 'waiting' : 'done'
  )

  useEffect(() => {
    const element = ref.current
    if (state !== 'waiting' || !element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setState('scanning')
        observer.disconnect()
      },
      { threshold: 0.5 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [state])

  // A native listener: React does not see animation events in every runtime.
  useEffect(() => {
    const element = ref.current
    if (state !== 'scanning' || !element) return
    const finish = (event: Event) => {
      if (event.target === element) setState('done')
    }
    element.addEventListener('animationend', finish)
    return () => element.removeEventListener('animationend', finish)
  }, [state])

  if (state === 'done') return null

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid='generation-scan'
      data-state={state}
      className='cinema-scan pointer-events-none absolute inset-0 z-[1]'
    >
      <div className='cinema-scan-blur absolute inset-0' />
      <div className='cinema-scan-beam absolute inset-y-0 w-0.5' />
      <span className='cinema-scan-label bg-ink/70 absolute top-3 left-3 rounded-md px-2 py-0.5 font-mono text-xs text-white/90'>
        {t('Generating...')}
      </span>
    </div>
  )
}
