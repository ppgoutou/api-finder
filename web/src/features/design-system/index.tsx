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
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import {
  BUTTON_SIZE_PX,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  COLOR_GROUPS,
  CONSOLE_TYPE,
  MARKETING_TYPE,
  type TypeToken,
} from './tokens'

/**
 * The admin-only living style guide: the type scales, colours, radii and
 * buttons rendered from the theme itself, so it always shows what ships.
 */
export function DesignSystem() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Design system')}</span>
          <Badge variant='outline' className='shrink-0'>
            {t('Admin')}
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-6'>
          <p className='text-body-sm text-muted-foreground max-w-3xl'>
            {t(
              'Type scale, colors, radii and buttons for every page. Use these names instead of raw values.'
            )}
          </p>

          <section aria-labelledby='design-type' className='space-y-3'>
            <h2 id='design-type' className='text-section-title'>
              {t('Type scale')}
            </h2>
            <div className='grid gap-4 xl:grid-cols-2'>
              <TypeScaleCard
                title={t('Marketing pages')}
                tokens={MARKETING_TYPE}
              />
              <TypeScaleCard title={t('Console')} tokens={CONSOLE_TYPE} />
            </div>
          </section>

          <section aria-labelledby='design-colors' className='space-y-3'>
            <h2 id='design-colors' className='text-section-title'>
              {t('Colors')}
            </h2>
            <Card>
              <CardContent className='space-y-5'>
                {COLOR_GROUPS.map((group) => (
                  <div key={group.titleKey}>
                    <h3 className='text-card-title'>{t(group.titleKey)}</h3>
                    <ul className='mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'>
                      {group.tokens.map((token) => (
                        <li
                          key={token}
                          className='rounded-control border-border overflow-hidden border'
                        >
                          <span
                            aria-hidden
                            className='block h-10'
                            style={{ background: `var(--${token})` }}
                          />
                          <code className='text-caption block truncate px-2 py-1.5'>
                            {token}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby='design-radius' className='space-y-3'>
            <h2 id='design-radius' className='text-section-title'>
              {t('Radius')}
            </h2>
            <Card>
              <CardContent className='flex flex-wrap gap-4'>
                {[
                  { className: 'rounded-control', label: t('Controls') },
                  { className: 'rounded-card', label: t('Cards') },
                  {
                    className: 'rounded-panel',
                    label: t('Dialogs and panels'),
                  },
                  { className: 'rounded-full', label: t('Badges') },
                ].map((item) => (
                  <figure key={item.className} className='space-y-1.5'>
                    <span
                      aria-hidden
                      className={cn(
                        'bg-brand-soft border-brand/30 block h-16 w-28 border',
                        item.className
                      )}
                    />
                    <figcaption className='text-caption text-muted-foreground'>
                      {item.label} · <code>{item.className}</code>
                    </figcaption>
                  </figure>
                ))}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby='design-buttons' className='space-y-3'>
            <h2 id='design-buttons' className='text-section-title'>
              {t('Buttons')}
            </h2>
            <Card>
              <CardContent className='space-y-4 overflow-x-auto'>
                {BUTTON_VARIANTS.map((variant) => (
                  <div
                    key={variant}
                    className='flex min-w-max items-center gap-3'
                  >
                    <code className='text-caption text-muted-foreground w-24 shrink-0'>
                      {variant}
                    </code>
                    {BUTTON_SIZES.map((size) => (
                      <Button key={size} variant={variant} size={size}>
                        {t('Button')} {BUTTON_SIZE_PX[size]}
                      </Button>
                    ))}
                  </div>
                ))}
                <div className='dark rounded-card bg-night flex min-w-max items-center gap-3 p-3'>
                  <code className='text-caption w-24 shrink-0 text-white/60'>
                    night
                  </code>
                  {BUTTON_SIZES.map((size) => (
                    <Button key={size} variant='night' size={size}>
                      {t('Button')} {BUTTON_SIZE_PX[size]}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function TypeScaleCard(props: { title: string; tokens: TypeToken[] }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-card-title'>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className='divide-border divide-y'>
          {props.tokens.map((token) => (
            <li
              key={token.name}
              className='grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline sm:gap-4'
            >
              <span className='text-caption text-muted-foreground'>
                <code>{token.name}</code>
                <span className='block tabular-nums'>{token.spec}</span>
              </span>
              <span className={cn('min-w-0 truncate', token.className)}>
                {t('Every model, one API')}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
