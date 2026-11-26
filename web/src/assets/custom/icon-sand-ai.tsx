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
import type { SVGProps } from 'react'

type IconSandAiProps = SVGProps<SVGSVGElement> & {
  size?: number
}

/**
 * Sand AI (MAGI) mark, traced from its logo. It draws in the current text
 * color, so it reads dark on light surfaces, light on dark ones and takes a
 * hover or selected color where it sits.
 */
export function IconSandAi({ size = 20, ...props }: IconSandAiProps) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='2 2 24 24'
      width={size}
      height={size}
      fill='currentColor'
      aria-hidden='true'
      {...props}
    >
      <rect x='6' y='2.5' width='16' height='3.5' rx='1' />
      <rect x='6' y='22' width='16' height='3.5' rx='1' />
      <path d='M6 5h2.2v3L22 16.5V23h-2.2v-3L6 11.5Z' />
      <path d='M19.8 5H22v6.6l-2.6.6-3.6-1.8 4-2.1Z' />
      <path d='M8.2 23H6v-6.6l2.6-.6 3.6 1.8-4 2.1Z' />
    </svg>
  )
}
