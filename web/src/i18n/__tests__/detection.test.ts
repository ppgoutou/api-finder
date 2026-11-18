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
// @vitest-environment jsdom
import { createInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { INTERFACE_LANGUAGE_STORAGE_KEY } from '../languages'

/** Load the app's i18n config as a fresh page load with these browser languages. */
async function loadPage(browserLanguages: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(
    browserLanguages
  )
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(
    browserLanguages[0] ?? ''
  )
  vi.resetModules()
  const config = await import('../config')
  const i18n = createInstance().use(LanguageDetector)
  await i18n.init({ ...config.i18nOptions, debug: false })
  return { i18n, appI18n: config.default }
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('interface language detection', () => {
  test('a supported browser language becomes the interface language', async () => {
    const { i18n } = await loadPage(['ja-JP', 'ja'])

    expect(i18n.resolvedLanguage).toBe('ja')
  })

  test('a Chinese browser maps onto the zhCN / zhTW interface codes', async () => {
    expect((await loadPage(['zh-CN'])).i18n.resolvedLanguage).toBe('zhCN')
    expect((await loadPage(['zh-HK'])).i18n.resolvedLanguage).toBe('zhTW')
  })

  test('an unsupported browser language falls back to English', async () => {
    const { i18n } = await loadPage(['de-DE', 'de'])

    expect(i18n.resolvedLanguage).toBe('en')
  })

  test('the detected language is not stored, so later visits re-detect', async () => {
    await loadPage(['fr-FR'])

    expect(localStorage.length).toBe(0)
    expect((await loadPage(['ru-RU'])).i18n.resolvedLanguage).toBe('ru')
  })

  test('a language the visitor picked wins over the browser language', async () => {
    localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, 'vi')

    expect((await loadPage(['ja-JP'])).i18n.resolvedLanguage).toBe('vi')
  })

  test('the legacy auto-detected cache no longer pins the language', async () => {
    localStorage.setItem('i18nextLng', 'en')

    const { i18n } = await loadPage(['fr-FR'])

    expect(i18n.resolvedLanguage).toBe('fr')
    expect(localStorage.getItem('i18nextLng')).toBeNull()
  })

  test('the page lang attribute follows the interface language', async () => {
    const { appI18n } = await loadPage(['en-US'])

    await appI18n.changeLanguage('zhTW')

    expect(document.documentElement.lang).toBe('zh-TW')
  })
})
