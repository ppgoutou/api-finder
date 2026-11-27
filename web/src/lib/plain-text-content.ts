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
import { isLikelyHtml } from '@/lib/content-format'
import { joinLanguageBlocks, parseLanguageBlocks } from '@/lib/language-blocks'

/*
 * The footer and the about page are written as plain text; their look is fixed
 * in code. Links are written as web addresses or email addresses, and the
 * layout follows from where lines and blank lines fall.
 */

/** A run of text, linked when it is a web or email address. */
export type TextPiece = { text: string; href?: string }

const ADDRESS =
  /(https?:\/\/[^\s<>"'，。；、！？）)]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g

function addressHref(address: string): string {
  return /^https?:\/\//i.test(address) ? address : `mailto:${address}`
}

/** Splits text into plain runs and linked web or email addresses. */
export function linkifyText(text: string): TextPiece[] {
  const pieces: TextPiece[] = []
  let last = 0
  for (const match of text.matchAll(ADDRESS)) {
    // A sentence may end right after an address.
    const address = match[0].replace(/[.,;:!?]+$/, '')
    const start = match.index
    if (start > last) pieces.push({ text: text.slice(last, start) })
    pieces.push({ text: address, href: addressHref(address) })
    last = start + address.length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })
  return pieces
}

export type FooterIconService = 'x' | 'telegram' | 'discord' | 'email' | 'link'

export type FooterItem =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | {
      kind: 'icon'
      service: FooterIconService
      href: string
      label: string
    }

function footerIcon(address: string): FooterItem {
  const href = addressHref(address)
  if (href.startsWith('mailto:')) {
    return { kind: 'icon', service: 'email', href, label: address }
  }
  const url = new URL(href)
  const host = url.hostname.replace(/^www\./, '')
  const handle = url.pathname.replaceAll(/^\/+|\/+$/g, '')
  if (host === 'x.com' || host === 'twitter.com') {
    return { kind: 'icon', service: 'x', href, label: 'X (Twitter)' }
  }
  if (host === 't.me' || host === 'telegram.me') {
    const label = handle ? `Telegram @${handle}` : 'Telegram'
    return { kind: 'icon', service: 'telegram', href, label }
  }
  if (host === 'discord.gg' || host.endsWith('discord.com')) {
    return { kind: 'icon', service: 'discord', href, label: 'Discord' }
  }
  return { kind: 'icon', service: 'link', href, label: host }
}

/**
 * Reads footer text line by line: a line holding only an address becomes an
 * icon (X, Telegram, Discord, email, or a plain link icon), a line ending in
 * an address becomes a text link, and any other line is shown as text.
 */
export function parseFooterText(text: string): FooterItem[] {
  const items: FooterItem[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const pieces = linkifyText(line)
    const last = pieces.at(-1)
    if (pieces.length === 1 && last?.href) {
      items.push(footerIcon(last.text))
      continue
    }
    if (pieces.length === 2 && last?.href) {
      items.push({
        kind: 'link',
        text: pieces[0].text.trim(),
        href: last.href,
      })
      continue
    }
    items.push({ kind: 'text', text: line })
  }
  return items
}

/** A list line; `label` is the bolded text before its colon, colon included. */
export type AboutListItem = { label?: string; pieces: TextPiece[] }

export type AboutBlock =
  | { kind: 'title'; text: string }
  | { kind: 'lead'; pieces: TextPiece[] }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; pieces: TextPiece[] }
  | { kind: 'list'; ordered: boolean; items: AboutListItem[] }

const NUMBERED_LINE = /^\d{1,2}[.、)）]\s*/
const BULLET_LINE = /^[-•·*]\s+/
const SENTENCE_END = /[。．.！!？?；;：:，,、)）]$/

function listItem(line: string): AboutListItem {
  const text = line.replace(NUMBERED_LINE, '').replace(BULLET_LINE, '')
  const labelled = /^([^：:]{1,16})([：:])\s*(.+)$/.exec(text)
  if (!labelled || labelled[3].startsWith('//')) {
    return { pieces: linkifyText(text) }
  }
  // The label keeps the colon it was written with: full-width in Chinese,
  // an ASCII colon and a space otherwise.
  const colon = labelled[2] === ':' ? ': ' : '：'
  return {
    label: `${labelled[1].trim()}${colon}`,
    pieces: linkifyText(labelled[3]),
  }
}

function isHeadingLine(line: string): boolean {
  return (
    line.length <= 40 &&
    !SENTENCE_END.test(line) &&
    !/[：:]/.test(line) &&
    !NUMBERED_LINE.test(line) &&
    !BULLET_LINE.test(line) &&
    !linkifyText(line).some((piece) => piece.href)
  )
}

function textBlock(lines: string[]): AboutBlock {
  const single = lines.length === 1 ? lines[0] : null
  if (
    single !== null &&
    !NUMBERED_LINE.test(single) &&
    !BULLET_LINE.test(single)
  ) {
    return { kind: 'paragraph', pieces: linkifyText(single) }
  }
  return {
    kind: 'list',
    ordered: lines.every((line) => NUMBERED_LINE.test(line)),
    items: lines.map(listItem),
  }
}

/**
 * Reads about-page text: the first line is the title and a paragraph right
 * after it the lead. Paragraphs are separated by blank lines. A short line
 * without a colon or closing punctuation is a section heading, alone or at the
 * top of a paragraph; a paragraph of several lines is a list, numbered when
 * its lines start with 1. 2. 3.; a list line such as "Telegram: …" shows its
 * label in bold.
 */
export function parseAboutText(text: string): AboutBlock[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0)
  if (paragraphs.length === 0) return []

  const [titleLine, ...firstRest] = paragraphs[0]
  const blocks: AboutBlock[] = [{ kind: 'title', text: titleLine }]
  const rest =
    firstRest.length > 0
      ? [firstRest, ...paragraphs.slice(1)]
      : paragraphs.slice(1)

  rest.forEach((lines, index) => {
    const [first, ...after] = lines
    if (isHeadingLine(first)) {
      blocks.push({ kind: 'heading', text: first })
      if (after.length > 0) blocks.push(textBlock(after))
      return
    }
    const block = textBlock(lines)
    if (index === 0 && block.kind === 'paragraph') {
      blocks.push({ kind: 'lead', pieces: block.pieces })
      return
    }
    blocks.push(block)
  })
  return blocks
}

function anchorText(anchor: Element): string {
  const href = anchor.getAttribute('href') ?? ''
  const text = anchor.textContent?.replaceAll(/\s+/g, ' ').trim() ?? ''
  if (href.startsWith('mailto:')) return href.slice('mailto:'.length)
  if (/^https?:\/\//i.test(href)) return href
  return text
}

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  if (node.tagName === 'A') return anchorText(node)
  if (node.tagName === 'BR') return '\n'
  return [...node.childNodes].map(inlineText).join('')
}

function footerLines(node: Node, lines: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replaceAll(/\s+/g, ' ').trim()
    if (text) lines.push(text)
    return
  }
  if (!(node instanceof Element)) return
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? ''
    const text = node.textContent?.replaceAll(/\s+/g, ' ').trim() ?? ''
    const address = anchorText(node)
    lines.push(
      text && address !== text && href.startsWith('http')
        ? `${text} ${address}`
        : address
    )
    return
  }
  node.childNodes.forEach((child) => footerLines(child, lines))
}

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
])

function aboutParagraphs(node: Node, paragraphs: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim()
    if (text) paragraphs.push(text)
    return
  }
  if (!(node instanceof Element)) return
  if (BLOCK_TAGS.has(node.tagName)) {
    const text = inlineText(node)
      .replaceAll(/[ \t]+/g, ' ')
      .trim()
    if (text) paragraphs.push(text)
    return
  }
  if (node.tagName === 'UL' || node.tagName === 'OL') {
    const ordered = node.tagName === 'OL'
    const items = [...node.children]
      .filter((child) => child.tagName === 'LI')
      .map((item, index) => {
        const text = inlineText(item).replaceAll(/\s+/g, ' ').trim()
        return ordered ? `${index + 1}. ${text}` : text
      })
    if (items.length > 0) paragraphs.push(items.join('\n'))
    return
  }
  node.childNodes.forEach((child) => aboutParagraphs(child, paragraphs))
}

function htmlToText(html: string, layout: 'footer' | 'about'): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc
    .querySelectorAll('style, script, svg, template')
    .forEach((el) => el.remove())
  if (layout === 'footer') {
    const lines: string[] = []
    footerLines(doc.body, lines)
    return lines.join('\n')
  }
  const paragraphs: string[] = []
  aboutParagraphs(doc.body, paragraphs)
  return paragraphs.join('\n\n')
}

/**
 * Turns footer or about content saved as HTML before these fields became
 * plain text into the equivalent text, keeping each language block. Content
 * that is already text is returned unchanged.
 */
export function legacyHtmlToText(
  content: string,
  layout: 'footer' | 'about'
): string {
  if (!isLikelyHtml(content)) return content
  const parsed = parseLanguageBlocks(content)
  const convert = (text: string) =>
    isLikelyHtml(text) ? htmlToText(text, layout) : text
  return joinLanguageBlocks({
    shared: convert(parsed.shared),
    blocks: parsed.blocks.map((block) => ({
      locale: block.locale,
      text: convert(block.text),
    })),
  })
}
