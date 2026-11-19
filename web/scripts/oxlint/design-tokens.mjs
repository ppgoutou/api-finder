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

// Guards for the site design guidelines: type sizes, colours and buttons
// come from the theme, not from values written in a page.

// `text-[13px]`, `sm:text-[0.8rem]`, `!text-[11px]`. Relative `em` sizes (inline
// code inside a paragraph) and `text-[length:inherit]` are allowed.
const arbitraryFontSize = /(?<![\w-])text-\[\d*\.?\d+(?:px|rem)\]/

const paletteHues =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const colorUtilities =
  'text|bg|border(?:-[trblxyse])?|ring|ring-offset|outline|from|via|to|fill|stroke|divide|decoration|shadow|placeholder|caret|accent'

// `bg-amber-500`, `dark:text-emerald-300/80`, `hover:border-l-rose-600`.
const paletteColor = new RegExp(
  `(?<![\\w-])(?:${colorUtilities})-(?:${paletteHues})-(?:50|[1-9]00|950)(?![\\w-])`
)
// `text-[#22c55e]`, `bg-[#fff]/50`.
const arbitraryHexColor = new RegExp(
  `(?<![\\w-])(?:${colorUtilities})-\\[#[0-9a-fA-F]{3,8}\\]`
)

function stringRule(meta, test) {
  return {
    meta,
    create(context) {
      function check(node, value) {
        if (typeof value !== 'string') return
        const match = test(value)
        if (match) {
          context.report({ node, messageId: 'found', data: { value: match } })
        }
      }
      return {
        Literal(node) {
          check(node, node.value)
        },
        TemplateElement(node) {
          check(node, node.value.cooked ?? node.value.raw)
        },
      }
    },
  }
}

export default {
  rules: {
    'no-arbitrary-font-size': stringRule(
      {
        type: 'suggestion',
        schema: [],
        messages: {
          found:
            "'{{value}}' sets a hand-written font size. Use a type scale class such as text-micro, text-caption, text-body-sm or text-page-title.",
        },
      },
      (value) => value.match(arbitraryFontSize)?.[0]
    ),
    'no-raw-palette-color': stringRule(
      {
        type: 'suggestion',
        schema: [],
        messages: {
          found:
            "'{{value}}' uses a raw palette colour. Use a theme colour such as brand, vip, success, warning, destructive, info, muted or chart-1..8.",
        },
      },
      (value) =>
        value.match(paletteColor)?.[0] ?? value.match(arbitraryHexColor)?.[0]
    ),
    'no-raw-button': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: {
          found:
            'Use Button from @/components/ui/button instead of a raw <button>. A special control (listbox option, spinner step) may keep it with an oxlint-disable comment that says why.',
        },
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (
              node.name.type === 'JSXIdentifier' &&
              node.name.name === 'button'
            ) {
              context.report({ node, messageId: 'found' })
            }
          },
        }
      },
    },
  },
}
