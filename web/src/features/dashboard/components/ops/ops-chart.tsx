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
import { VChart } from '@visactor/react-vchart'
import { useEffect, useState } from 'react'

import { useTheme } from '@/context/theme-provider'
import { VCHART_OPTION } from '@/lib/vchart'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

export function OpsChart(props: {
  spec: Record<string, unknown>
  label: string
}) {
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)

  useEffect(() => {
    let active = true
    setThemeReady(false)
    themeManagerPromise ??= import('@visactor/vchart').then(
      (m) => m.ThemeManager
    )
    void themeManagerPromise.then((ThemeManager) => {
      if (!active) return
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    })
    return () => {
      active = false
    }
  }, [resolvedTheme])

  return (
    <div role='img' aria-label={props.label} className='h-full w-full'>
      {themeReady && (
        <VChart
          key={resolvedTheme}
          spec={{
            ...props.spec,
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            background: 'transparent',
          }}
          option={VCHART_OPTION}
        />
      )}
    </div>
  )
}
