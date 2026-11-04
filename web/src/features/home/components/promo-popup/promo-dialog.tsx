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
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { PromoCard } from '../../lib/promo-popup'
import { PromoCardView } from './promo-cards'

type PromoDialogProps = {
  open: boolean
  cards: PromoCard[]
  onClose: () => void
  /** Runs on close when the visitor asked not to see the popup again today. */
  onDismissToday?: () => void
}

export function PromoDialog(props: PromoDialogProps) {
  const { t } = useTranslation()
  const [api, setApi] = useState<CarouselApi>()
  const [selected, setSelected] = useState(0)
  const [hideToday, setHideToday] = useState(false)
  const count = props.cards.length
  const index = Math.min(selected, Math.max(count - 1, 0))
  const multiple = count > 1

  useEffect(() => {
    if (!api) return
    const sync = () => setSelected(api.selectedScrollSnap())
    api.on('select', sync)
    return () => {
      api.off('select', sync)
    }
  }, [api])

  const show = (next: number) => {
    const wrapped = (next + count) % count
    setSelected(wrapped)
    api?.scrollTo(wrapped)
  }

  const close = () => {
    if (hideToday) props.onDismissToday?.()
    props.onClose()
  }

  const cardLabels: Record<PromoCard['kind'], string> = {
    model: t('Limited-time price'),
    recharge: t('Top-up offer'),
    list: t('Deals this week'),
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='max-w-[560px] grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden rounded-[20px] p-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-[560px]'
      >
        <DialogTitle className='sr-only'>
          {t('Limited-time offers')}
        </DialogTitle>
        <div
          aria-hidden
          className='flex h-14 items-center px-4 text-base font-bold sm:hidden'
        >
          {t('Limited-time offers')}
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('Close')}
          onClick={close}
          className='absolute top-1.5 right-1 z-10 size-11 rounded-xl sm:top-2 sm:right-2 sm:text-white sm:hover:bg-white/15 sm:hover:text-white sm:dark:hover:bg-white/15'
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>

        <Carousel
          setApi={setApi}
          opts={{ loop: multiple, watchDrag: multiple, align: 'center' }}
          aria-label={t('Limited-time offers')}
        >
          <CarouselContent className='ml-0 max-sm:-ml-3'>
            {props.cards.map((card, cardIndex) => {
              const active = cardIndex === index
              return (
                <CarouselItem
                  key={JSON.stringify(card)}
                  inert={!active}
                  aria-hidden={!active}
                  className={cn(
                    'pl-0 max-sm:pl-3',
                    multiple && 'max-sm:basis-[calc(100%-2.5rem)]'
                  )}
                >
                  <div className='overflow-hidden max-sm:rounded-2xl max-sm:border'>
                    <PromoCardView card={card} onNavigate={close} />
                  </div>
                </CarouselItem>
              )
            })}
          </CarouselContent>
        </Carousel>

        <div className='px-4 pt-1.5 pb-0.5 sm:border-t'>
          {multiple && (
            <div className='flex items-center gap-1 max-sm:hidden'>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11 shrink-0'
                aria-label={t('Previous offer')}
                onClick={() => show(index - 1)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              </Button>
              <div className='flex min-w-0 flex-1 gap-2'>
                {props.cards.map((card, cardIndex) => {
                  const active = cardIndex === index
                  const label =
                    card.kind === 'model'
                      ? card.modelName
                      : cardLabels[card.kind]
                  return (
                    <button
                      key={JSON.stringify(card)}
                      type='button'
                      aria-current={active ? 'true' : undefined}
                      onClick={() => show(cardIndex)}
                      className={cn(
                        'flex h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1.5 text-xs',
                        active
                          ? 'text-foreground font-semibold'
                          : 'text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'block h-[3px] w-full rounded-full',
                          active
                            ? 'bg-brand dark:bg-brand-on-dark'
                            : 'bg-border'
                        )}
                      />
                      <span className='truncate'>{label}</span>
                    </button>
                  )
                })}
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11 shrink-0'
                aria-label={t('Next offer')}
                onClick={() => show(index + 1)}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
            </div>
          )}
          <div className='flex items-center justify-between sm:px-3'>
            <Label className='text-muted-foreground flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-normal'>
              <Checkbox
                checked={hideToday}
                onCheckedChange={(checked) => setHideToday(checked === true)}
              />
              {t("Don't show again today")}
            </Label>
            {multiple && (
              <>
                <span className='text-muted-foreground text-[13px] max-sm:hidden'>
                  {index + 1} / {count}
                </span>
                <div aria-hidden className='flex gap-1.5 sm:hidden'>
                  {props.cards.map((card, cardIndex) => (
                    <span
                      key={JSON.stringify(card)}
                      className={cn(
                        'h-1.5 rounded-full',
                        cardIndex === index
                          ? 'bg-brand w-[18px]'
                          : 'bg-border w-1.5'
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
