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
import { cn } from '@/lib/utils'

interface ClipSpecProps {
  /** Admin-entered spec such as "seedance 2.0 · 720P · 15s". */
  spec: string
  className?: string
}

/**
 * The model, resolution and length a clip was made with, set as separate
 * words on a dark chip over the video instead of one dot-joined string.
 */
export function ClipSpec(props: ClipSpecProps) {
  const parts = props.spec
    .split(/\s*[·•|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)

  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-md bg-ink/70 text-white/90 tabular-nums',
        props.className
      )}
    >
      {parts.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </span>
  )
}
