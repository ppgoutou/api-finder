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
import { type TextPiece, parseAboutText } from '@/lib/plain-text-content'

function Pieces(props: { pieces: TextPiece[] }) {
  return props.pieces.map((piece) => {
    const key = `${piece.text}|${piece.href ?? ''}`
    if (!piece.href) return <span key={key}>{piece.text}</span>
    const external = !piece.href.startsWith('mailto:')
    return (
      <a
        key={key}
        href={piece.href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className='text-primary break-all hover:underline'
      >
        {piece.text}
      </a>
    )
  })
}

/** Admin-written about text laid out in the site's fixed article style. */
export function AboutText(props: { text: string }) {
  const blocks = parseAboutText(props.text)

  return (
    <article className='text-body-lg mx-auto max-w-[760px] px-5 py-10 leading-relaxed sm:py-14'>
      {blocks.map((block) => {
        const key = JSON.stringify(block)
        switch (block.kind) {
          case 'title':
            return (
              <h1
                key={key}
                className='text-foreground text-heading-2 mb-4'
              >
                {block.text}
              </h1>
            )
          case 'lead':
            return (
              <p key={key} className='text-muted-foreground text-lead mb-3'>
                <Pieces pieces={block.pieces} />
              </p>
            )
          case 'heading':
            return (
              <h2
                key={key}
                className='border-border text-heading-3 mt-9 mb-3 border-b pb-2'
              >
                {block.text}
              </h2>
            )
          case 'paragraph':
            return (
              <p key={key} className='mb-3'>
                <Pieces pieces={block.pieces} />
              </p>
            )
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List
                key={key}
                className={
                  block.ordered
                    ? 'mb-3 list-decimal pl-[22px]'
                    : 'mb-3 list-disc pl-[22px]'
                }
              >
                {block.items.map((item) => (
                  <li key={JSON.stringify(item)} className='my-1.5'>
                    {item.label && (
                      <strong className='font-semibold'>{item.label}</strong>
                    )}
                    <Pieces pieces={item.pieces} />
                  </li>
                ))}
              </List>
            )
          }
        }
      })}
    </article>
  )
}
