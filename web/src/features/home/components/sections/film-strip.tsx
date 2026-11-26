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
import { useShowcaseCards } from '../../hooks/use-showcase-cards'

/**
 * A strip of example stills that scrolls on its own below the hero. It is
 * decoration: the same clips follow, with their prompts, in the showcase. The
 * list is rendered twice so the loop has no seam.
 */
export function FilmStrip() {
  // Built-in examples have no media while no media host is set.
  const cards = useShowcaseCards().filter((card) => card.poster || card.video)
  if (cards.length === 0) return null

  const frames = ['first', 'second'].flatMap((copy) =>
    cards.map((card) => ({ ...card, key: `${copy}:${card.key}` }))
  )

  return (
    <div
      aria-hidden
      data-testid='film-strip'
      className='cinema-marquee relative z-10 overflow-hidden py-6'
    >
      <ul className='cinema-marquee-track flex w-max'>
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
              {card.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
