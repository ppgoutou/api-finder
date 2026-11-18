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
/*
 * The design tokens the /design page shows. Class names are written out in
 * full so Tailwind generates them; they mirror the scales in theme.css.
 */

export interface TypeToken {
  className: string
  name: string
  spec: string
}

export const MARKETING_TYPE: TypeToken[] = [
  {
    className: 'text-display font-display uppercase',
    name: 'display',
    spec: '48–96 · 700',
  },
  {
    className: 'text-heading-1 font-display',
    name: 'heading-1',
    spec: '36–56 · 700',
  },
  { className: 'text-heading-2', name: 'heading-2', spec: '28–36 · 600' },
  { className: 'text-heading-3', name: 'heading-3', spec: '20 · 600' },
  { className: 'text-lead', name: 'lead', spec: '18 · 400' },
  { className: 'text-body-lg', name: 'body-lg', spec: '16 · 400' },
  { className: 'text-eyebrow uppercase', name: 'eyebrow', spec: '12 · 500' },
]

export const CONSOLE_TYPE: TypeToken[] = [
  { className: 'text-page-title', name: 'page-title', spec: '20 · 600' },
  { className: 'text-section-title', name: 'section-title', spec: '16 · 600' },
  { className: 'text-card-title', name: 'card-title', spec: '14 · 600' },
  { className: 'text-body', name: 'body', spec: '14 · 400' },
  { className: 'text-body-sm', name: 'body-sm', spec: '13 · 400' },
  { className: 'text-caption', name: 'caption', spec: '12 · 400' },
  { className: 'text-micro', name: 'micro', spec: '11 · 500' },
  {
    className: 'text-metric tabular-nums',
    name: 'metric',
    spec: '24–32 · 600',
  },
]

export interface ColorGroup {
  /** i18n key of the group title. */
  titleKey: string
  /** CSS custom properties from theme.css, without the leading dashes. */
  tokens: string[]
}

export const COLOR_GROUPS: ColorGroup[] = [
  { titleKey: 'Brand', tokens: ['brand', 'brand-hover', 'brand-soft'] },
  {
    titleKey: 'VIP',
    tokens: ['vip', 'vip-hover', 'vip-soft', 'accent-night'],
  },
  {
    titleKey: 'Status',
    tokens: ['success', 'warning', 'info', 'destructive'],
  },
  {
    titleKey: 'Neutrals',
    tokens: [
      'background',
      'card',
      'muted',
      'border',
      'muted-foreground',
      'foreground',
    ],
  },
  {
    titleKey: 'Charts',
    tokens: [
      'chart-1',
      'chart-2',
      'chart-3',
      'chart-4',
      'chart-5',
      'chart-6',
      'chart-7',
      'chart-8',
    ],
  },
]

export const BUTTON_VARIANTS = [
  'default',
  'outline',
  'ghost',
  'destructive',
  'link',
  'vip',
] as const

export const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg', 'xl'] as const

/** Button height in px for each size, as listed on the page. */
export const BUTTON_SIZE_PX: Record<(typeof BUTTON_SIZES)[number], number> = {
  xs: 24,
  sm: 28,
  default: 32,
  lg: 40,
  xl: 44,
}
