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
import { Clapperboard, Megaphone, ShoppingBag, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function UseCases() {
  const { t } = useTranslation()

  const cases = [
    {
      icon: ShoppingBag,
      title: t('Product and e-commerce ads'),
      desc: t(
        'Turn a product photo into a polished commercial shot for your store or listing.'
      ),
    },
    {
      icon: Megaphone,
      title: t('Social media shorts'),
      desc: t(
        'Make eye-catching vertical clips for TikTok, Reels and Shorts in minutes.'
      ),
    },
    {
      icon: Clapperboard,
      title: t('Film and storyboards'),
      desc: t(
        'Preview scenes, camera moves and pacing before you shoot anything.'
      ),
    },
    {
      icon: Sparkles,
      title: t('Anime and game art'),
      desc: t(
        'Animate characters and worlds from concept art while keeping their look.'
      ),
    },
  ]

  return (
    <section
      id='use-cases'
      className='relative z-10 scroll-mt-20 px-6 py-14 md:py-20'
    >
      <div className='mx-auto max-w-6xl'>
        <h2 className='text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Video for every team that creates')}
        </h2>
        <ul className='mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2'>
          {cases.map((item) => (
            <li key={item.title} className='border-border border-t pt-5'>
              <h3 className='flex items-center gap-2.5 text-lg font-semibold'>
                <item.icon
                  className='text-brand dark:text-brand-on-dark size-5 shrink-0'
                  aria-hidden
                />
                {item.title}
              </h3>
              <p className='text-muted-foreground mt-2 max-w-md'>{item.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
