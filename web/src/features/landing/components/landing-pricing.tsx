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

import { useVideoSeriesPricing } from '@/features/home/hooks/use-video-series-pricing'

/**
 * Resolutions as rows and the home page model series as columns, each cell
 * the live lowest price per second across the series' models. A series
 * without that resolution shows a dash.
 */
export function LandingPricing() {
  const { t } = useTranslation()
  const seriesList = useVideoSeriesPricing()
  const options = [
    ...new Set(
      seriesList.flatMap((series) => series.rows.map((row) => row.option))
    ),
  ]
  const notes = seriesList.flatMap((series) =>
    series.durationRange
      ? [
          t('{{model}}: {{min}}–{{max}}s per clip', {
            model: series.name,
            min: series.durationRange[0],
            max: series.durationRange[1],
          }),
        ]
      : []
  )
  const perVideo = seriesList.flatMap((series) =>
    series.perVideo
      ? [
          `${series.name} · ${t('{{price}} / video', {
            price: series.perVideo.price,
          })}`,
        ]
      : []
  )

  return (
    <div
      id='pricing'
      className='from-brand-on-dark/55 rounded-2xl bg-gradient-to-br via-white/5 to-violet-400/45 p-px'
    >
      <div className='bg-ink-raised h-full rounded-[15px] p-5 md:p-6'>
        <div className='flex flex-wrap items-baseline justify-between gap-2'>
          <h2 className='text-heading-2 text-white'>{t('Pricing')}</h2>
          <p className='text-brand-on-dark font-mono text-xs'>
            ● {t('Live · per second')}
          </p>
        </div>

        {options.length === 0 ? (
          <p className='mt-6 text-sm text-white/60'>
            {t('Billed by generated seconds')}
          </p>
        ) : (
          <div className='mt-4 overflow-x-auto'>
            <table className='w-full text-left text-sm'>
              <thead>
                <tr className='border-b border-white/10 text-xs text-white/50'>
                  <th scope='col' className='py-2.5 pr-3 font-normal'>
                    {t('Resolution')}
                  </th>
                  {seriesList.map((series) => (
                    <th
                      key={series.name}
                      scope='col'
                      className='py-2.5 pr-3 font-mono font-normal whitespace-nowrap text-white/75'
                    >
                      {series.name}
                      {series.isNew && (
                        <span className='text-micro ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 font-sans text-violet-300'>
                          {t('New')}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((option) => (
                  <tr
                    key={option}
                    className='border-b border-white/5 last:border-0'
                  >
                    <th
                      scope='row'
                      className='py-3 pr-3 font-normal text-white/60'
                    >
                      {option.replace(/k$/i, 'K')}
                    </th>
                    {seriesList.map((series) => {
                      const row = series.rows.find(
                        (entry) => entry.option === option
                      )
                      return (
                        <td key={series.name} className='py-3 pr-3'>
                          {row ? (
                            <span className='font-mono font-semibold whitespace-nowrap text-white tabular-nums'>
                              {row.approximate ? `≈${row.price}` : row.price}
                            </span>
                          ) : (
                            <span className='text-white/40'>—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className='mt-4 text-xs leading-relaxed text-white/50'>
          {t(
            'Each price is the lowest live price per generated second in the series; ≈ marks prices estimated from video tokens.'
          )}{' '}
          {[...notes, ...perVideo].join(' · ')}
        </p>
      </div>
    </div>
  )
}
