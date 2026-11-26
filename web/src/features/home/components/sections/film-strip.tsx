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
import { useStudioGallery } from '@/features/video-studio/hooks/use-studio-gallery'

/** Seconds each frame takes to scroll past, so long strips do not race. */
const SECONDS_PER_FRAME = 6

/**
 * Whether a gallery work is wider than tall, from the aspect ratio in its
 * spec such as "Seedance 2.5 · 16:9 · 720p · 15s".
 */
function isLandscapeSpec(spec: string): boolean {
  const match = /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(spec)
  if (!match) return false
  return Number(match[1]) > Number(match[2])
}

/**
 * A strip of landscape stills from the video-studio gallery that scrolls on
 * its own below the hero, so it shows other work than the showcase further
 * down. It is decoration. The list is rendered twice so the loop has no seam;
 * with no landscape gallery work it is left out.
 */
export function FilmStrip() {
  const works = useStudioGallery().items.filter(
    (item) => (item.poster || item.video) && isLandscapeSpec(item.spec)
  )
  if (works.length === 0) return null

  const frames = ['first', 'second'].flatMap((copy) =>
    works.map((work) => ({
      ...work,
      key: `${copy}:${work.video || work.poster}`,
    }))
  )

  return (
    <div
      aria-hidden
      data-testid='film-strip'
      className='cinema-marquee relative z-10 overflow-hidden py-6'
    >
      <ul
        className='cinema-marquee-track flex w-max'
        style={{ animationDuration: `${works.length * SECONDS_PER_FRAME}s` }}
      >
        {frames.map((card) => (
          <li
            key={card.key}
            className='border-border/60 bg-ink-raised relative mr-3 aspect-video w-48 shrink-0 overflow-hidden rounded-xl border md:w-60'
          >
            {card.poster ? (
              <img
                src={card.poster}
                alt=''
                loading='lazy'
                decoding='async'
                className='size-full object-cover'
              />
            ) : (
              // No poster: the first loaded frame stands in for one.
              <video
                src={`${card.video}#t=0.5`}
                muted
                playsInline
                preload='metadata'
                tabIndex={-1}
                className='size-full object-cover'
              />
            )}
            <span className='from-ink/80 absolute inset-x-0 bottom-0 truncate bg-gradient-to-t to-transparent px-2.5 pt-6 pb-1.5 text-xs font-medium text-white/90'>
              {/* The model is the spec's first part, e.g. "Seedance 2.5". */}
              {card.spec.split('·')[0].trim()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
