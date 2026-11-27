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
import { describe, expect, it } from 'vitest'

import {
  legacyHtmlToText,
  linkifyText,
  parseAboutText,
  parseFooterText,
} from '../plain-text-content'

describe('linkifyText', () => {
  it('links web and email addresses and leaves sentence punctuation out', () => {
    expect(
      linkifyText('See https://example.com/a?b=1. Or mail me@example.com')
    ).toEqual([
      { text: 'See ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: '. Or mail ' },
      { text: 'me@example.com', href: 'mailto:me@example.com' },
    ])
  })
})

describe('parseFooterText', () => {
  it('reads text, text links and icon lines', () => {
    expect(
      parseFooterText(
        [
          '© 2026 API-Finder',
          'Partner: PX Show https://www.pxshow.com/?invite=1',
          'https://x.com/someone',
          'https://t.me/Support',
          'https://discord.gg/abc',
          'help@example.com',
          'https://blog.example.com',
        ].join('\n')
      )
    ).toEqual([
      { kind: 'text', text: '© 2026 API-Finder' },
      {
        kind: 'link',
        text: 'Partner: PX Show',
        href: 'https://www.pxshow.com/?invite=1',
      },
      {
        kind: 'icon',
        service: 'x',
        href: 'https://x.com/someone',
        label: 'X (Twitter)',
      },
      {
        kind: 'icon',
        service: 'telegram',
        href: 'https://t.me/Support',
        label: 'Telegram @Support',
      },
      {
        kind: 'icon',
        service: 'discord',
        href: 'https://discord.gg/abc',
        label: 'Discord',
      },
      {
        kind: 'icon',
        service: 'email',
        href: 'mailto:help@example.com',
        label: 'help@example.com',
      },
      {
        kind: 'icon',
        service: 'link',
        href: 'https://blog.example.com',
        label: 'blog.example.com',
      },
    ])
  })
})

describe('parseAboutText', () => {
  it('lays out title, lead, headings, lists and paragraphs', () => {
    const text = [
      '关于 API-Finder',
      '',
      'API-Finder 是 AI 视频创作平台。',
      '',
      '你可以创作什么',
      '文生视频：用文字描述场景。',
      '图生视频：用照片作为首帧。',
      '',
      '如何使用',
      '1. 免费注册账号；',
      '2. 充值；',
      '',
      '联系我们',
      'Email: help@example.com',
      'Telegram: https://t.me/Support',
      '',
      '官方人员不会主动私聊。',
    ].join('\n')

    expect(parseAboutText(text)).toEqual([
      { kind: 'title', text: '关于 API-Finder' },
      { kind: 'lead', pieces: [{ text: 'API-Finder 是 AI 视频创作平台。' }] },
      { kind: 'heading', text: '你可以创作什么' },
      {
        kind: 'list',
        ordered: false,
        items: [
          { label: '文生视频：', pieces: [{ text: '用文字描述场景。' }] },
          { label: '图生视频：', pieces: [{ text: '用照片作为首帧。' }] },
        ],
      },
      { kind: 'heading', text: '如何使用' },
      {
        kind: 'list',
        ordered: true,
        items: [
          { pieces: [{ text: '免费注册账号；' }] },
          { pieces: [{ text: '充值；' }] },
        ],
      },
      { kind: 'heading', text: '联系我们' },
      {
        kind: 'list',
        ordered: false,
        items: [
          {
            label: 'Email: ',
            pieces: [
              { text: 'help@example.com', href: 'mailto:help@example.com' },
            ],
          },
          {
            label: 'Telegram: ',
            pieces: [
              { text: 'https://t.me/Support', href: 'https://t.me/Support' },
            ],
          },
        ],
      },
      { kind: 'paragraph', pieces: [{ text: '官方人员不会主动私聊。' }] },
    ])
  })
})

describe('legacyHtmlToText', () => {
  it('turns footer HTML into one item per line, per language', () => {
    const html = [
      '<style>.a{}</style>',
      '<!-- lang:zh -->',
      '<span><span class="copy">© 2026 API-Finder 版权所有</span><a href="https://p.example.com/?a=1&amp;b=2" title="x">合作伙伴：PX Show</a>',
      '<span><a href="https://x.com/someone"><svg><path d="M0"/></svg></a><a href="mailto:help@example.com"><svg/></a></span></span>',
      '<!-- lang:en -->',
      '<span>© 2026 API-Finder</span>',
    ].join('\n')

    expect(legacyHtmlToText(html, 'footer')).toBe(
      [
        '<!-- lang:zh -->',
        '© 2026 API-Finder 版权所有',
        '合作伙伴：PX Show https://p.example.com/?a=1&b=2',
        'https://x.com/someone',
        'help@example.com',
        '<!-- lang:en -->',
        '© 2026 API-Finder',
      ].join('\n')
    )
  })

  it('turns about HTML into paragraphs, lists and addresses', () => {
    const html = [
      '<div class="about"><h2>About</h2><p class="lead">Intro with <a href="/docs">docs</a>.</p>',
      '<h3>Steps</h3><ol><li>Sign up;</li><li>Top up.</li></ol>',
      '<ul><li><strong>Text</strong>: words</li><li>Telegram: <a href="https://t.me/S">@S</a></li></ul></div>',
    ].join('')

    expect(legacyHtmlToText(html, 'about')).toBe(
      'About\n\nIntro with docs.\n\nSteps\n\n1. Sign up;\n2. Top up.\n\nText: words\nTelegram: https://t.me/S'
    )
  })

  it('leaves plain text alone', () => {
    expect(legacyHtmlToText('© 2026 Example', 'footer')).toBe('© 2026 Example')
  })
})
