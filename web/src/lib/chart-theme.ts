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
import { dataScheme as vchartDefaultDataScheme } from '@visactor/vchart/esm/theme/color-scheme/builtin/default'

type ThemeManagerLike = {
  registerTheme: (name: string, theme: Record<string, unknown>) => void
  setCurrentTheme: (name: string) => void
}

const SITE_CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-8',
]

let probe: CanvasRenderingContext2D | null | undefined

// Charts draw on a canvas and blend colours themselves, so theme colours
// (oklch, var()) are flattened to rgb by painting one pixel.
function toRgb(color: string): string | null {
  if (!color || typeof document === 'undefined') return null
  if (probe === undefined) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      probe = canvas.getContext('2d', { willReadFrequently: true })
    } catch {
      probe = null
    }
  }
  if (!probe) return null
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = '#000'
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  if (a === 0) return null
  return `rgb(${r}, ${g}, ${b})`
}

function vchartFallbackColors(domainLength: number): string[] {
  const scheme =
    vchartDefaultDataScheme.find(
      (item) => !item.maxDomainLength || domainLength <= item.maxDomainLength
    ) ?? vchartDefaultDataScheme.at(-1)
  return (scheme?.scheme ?? []).filter(
    (color): color is string => typeof color === 'string'
  )
}

/**
 * The eight theme chart colours (`--chart-1` … `--chart-8`) in a fixed order,
 * so a model or channel keeps its colour across charts. Falls back to the
 * VChart palette where the theme cannot be read (tests, SSR).
 */
export function getSiteChartColors(): string[] {
  if (typeof document === 'undefined') return vchartFallbackColors(8)
  const style = getComputedStyle(document.documentElement)
  const colors = SITE_CHART_TOKENS.map((token) =>
    toRgb(style.getPropertyValue(token).trim())
  )
  if (colors.some((color) => color === null)) return vchartFallbackColors(8)
  return colors as string[]
}

/**
 * Colours for an ordinal domain: the theme colours first, then VChart's
 * extended palette so long domains do not repeat colours.
 */
export function getChartColorRange(domainLength: number): string[] {
  const site = getSiteChartColors()
  if (domainLength <= site.length) return site
  const extra = vchartFallbackColors(domainLength).filter(
    (color) => !site.includes(color)
  )
  return [...site, ...extra]
}

/** Registers the site chart theme on VChart's light or dark base and uses it. */
export function applySiteChartTheme(
  themeManager: ThemeManagerLike,
  mode: string | undefined
): void {
  const type = mode === 'dark' ? 'dark' : 'light'
  const fontFamily =
    typeof document === 'undefined'
      ? undefined
      : getComputedStyle(document.body).fontFamily || undefined
  const name = `site-${type}`
  themeManager.registerTheme(name, {
    type,
    ...(fontFamily ? { fontFamily } : {}),
    colorScheme: { default: { dataScheme: getSiteChartColors() } },
  })
  themeManager.setCurrentTheme(name)
}
