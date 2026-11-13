import type { TFunction } from 'i18next'
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
import { ChevronDown, KeyRound, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { TitledCard } from '@/components/ui/titled-card'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

import { formatUpstreamPriceValue } from '../../lib/onboarding'
import type {
  UpstreamPriceChange,
  UpstreamPriceChannel,
  UpstreamPriceReport,
} from '../../types'

/** Without a channel, the named models are handled on every channel. */
export type AcknowledgeRequest = {
  channel_id?: number
  model_names?: string[]
  group_ratio?: boolean
}

function upstreamFieldLabel(field: string, t: TFunction): string {
  const labels: Record<string, string> = {
    quota_type: t('Billing type'),
    model_ratio: t('Input ratio'),
    completion_ratio: t('Completion ratio'),
    model_price: t('Price per request'),
    cache_ratio: t('Cache ratio'),
    create_cache_ratio: t('Cache write ratio'),
    image_ratio: t('Image ratio'),
    audio_ratio: t('Audio ratio'),
    audio_completion_ratio: t('Audio completion ratio'),
    billing_mode: t('Billing mode'),
    billing_expr: t('Billing expression'),
    billing_plugin_variants: t('Plugin billing'),
  }
  return labels[field] ?? field
}

function ChangeKindBadge(props: { kind: UpstreamPriceChange['kind'] }) {
  const { t } = useTranslation()
  if (props.kind === 'added') {
    return (
      <StatusBadge size='sm' variant='info' label={t('New in price list')} />
    )
  }
  if (props.kind === 'removed') {
    return (
      <StatusBadge
        size='sm'
        variant='danger'
        label={t('Gone from price list')}
      />
    )
  }
  return <StatusBadge size='sm' variant='warning' label={t('Price changed')} />
}

function ChangeFields(props: { change: UpstreamPriceChange }) {
  const { t } = useTranslation()
  if (props.change.fields.length === 0) return null
  return (
    <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
      {props.change.fields.map((field) => (
        <div key={field.field} className='contents'>
          <dt className='text-muted-foreground'>
            {upstreamFieldLabel(field.field, t)}
          </dt>
          <dd className='font-mono break-all'>
            {formatUpstreamPriceValue(field.previous)} →{' '}
            {formatUpstreamPriceValue(field.current)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Supplier price watch: tokens and the changes no workbench model shows.
 * Checks run from Sync upstream. The change list starts folded so a long
 * supplier list never pushes the workbench below it off screen.
 */
export function UpstreamPricePanel(props: {
  report: UpstreamPriceReport | undefined
  workbenchModels: Set<string>
  acknowledging: boolean
  onAcknowledge: (request: AcknowledgeRequest) => void
  onSaveToken: (channelId: number, token: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const channels = props.report?.channels ?? []
  const watched = channels.filter((channel) => channel.has_token)
  const lastCheck = Math.max(
    0,
    ...watched.map((channel) => channel.latest_time)
  )
  const failed = channels.filter((channel) => channel.status === 'error')
  const baselines = channels.filter((channel) => channel.status === 'baseline')
  const outside = (props.report?.changes ?? []).filter(
    (change) =>
      change.kind === 'group_ratio' ||
      !props.workbenchModels.has(change.model_name)
  )

  // Errors and the baseline note stay visible; only the change list folds.
  const hasBody =
    failed.length > 0 ||
    baselines.length > 0 ||
    (changesOpen && outside.length > 0)

  return (
    <Collapsible
      open={changesOpen}
      onOpenChange={setChangesOpen}
      className='shrink-0'
    >
      <TitledCard
        headerClassName={cn('sm:p-4 sm:!pb-4', !hasBody && 'border-b-0')}
        contentClassName={hasBody ? undefined : 'hidden'}
        title={t('Supplier price watch')}
        description={
          watched.length === 0
            ? t(
                'Add a supplier access token to a channel to compare its upstream prices.'
              )
            : t('{{count}} channels watched. Last check: {{time}}', {
                count: watched.length,
                time: lastCheck ? formatTimestamp(lastCheck) : t('Never'),
              })
        }
        icon={<TrendingUp aria-hidden className='size-4' />}
        action={
          <div className='flex flex-wrap gap-2'>
            {outside.length > 0 && (
              <CollapsibleTrigger
                render={<Button size='sm' variant='outline' />}
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-4 transition-transform',
                    changesOpen && 'rotate-180'
                  )}
                />
                {changesOpen
                  ? t('Hide changes')
                  : t('Show {{count}} changes', { count: outside.length })}
              </CollapsibleTrigger>
            )}
            <Button
              size='sm'
              variant='outline'
              onClick={() => setTokenDialogOpen(true)}
            >
              <KeyRound aria-hidden className='size-4' />
              {t('Supplier tokens')}
            </Button>
          </div>
        }
      >
        <div className='space-y-3'>
          {failed.map((channel) => (
            <Alert key={channel.id} variant='destructive'>
              <AlertTitle>{channel.name}</AlertTitle>
              <AlertDescription className='break-all'>
                {channel.error}
              </AlertDescription>
            </Alert>
          ))}
          {baselines.length > 0 && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Recorded the current upstream prices of {{names}} as the baseline. Later checks report changes against it.',
                { names: baselines.map((channel) => channel.name).join(', ') }
              )}
            </p>
          )}
          {outside.length > 0 && (
            <CollapsibleContent>
              <ul className='max-h-80 divide-y overflow-y-auto rounded-md border'>
                {outside.map((change) => (
                  <li
                    key={`${change.channel_id}:${change.kind}:${change.model_name}`}
                    className='flex flex-wrap items-start justify-between gap-2 p-3'
                  >
                    <div className='min-w-0 space-y-1'>
                      <div className='flex flex-wrap items-center gap-1.5 text-sm'>
                        <span className='text-muted-foreground'>
                          {change.channel_name}
                        </span>
                        {change.kind === 'group_ratio' ? (
                          <StatusBadge
                            size='sm'
                            variant='warning'
                            label={t('Group ratio changed')}
                          />
                        ) : (
                          <>
                            <span className='font-mono'>
                              {change.model_name}
                            </span>
                            <ChangeKindBadge kind={change.kind} />
                          </>
                        )}
                      </div>
                      <ChangeFields change={change} />
                    </div>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={props.acknowledging}
                      onClick={() =>
                        props.onAcknowledge(
                          change.kind === 'group_ratio'
                            ? {
                                channel_id: change.channel_id,
                                group_ratio: true,
                              }
                            : {
                                channel_id: change.channel_id,
                                model_names: [change.model_name],
                              }
                        )
                      }
                    >
                      {t('Mark handled')}
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          )}
        </div>
        <UpstreamTokenDialog
          open={tokenDialogOpen}
          onOpenChange={setTokenDialogOpen}
          channels={channels}
          onSave={props.onSaveToken}
        />
      </TitledCard>
    </Collapsible>
  )
}

function UpstreamTokenDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: UpstreamPriceChannel[]
  onSave: (channelId: number, token: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

  const save = async (channelId: number, token: string) => {
    setSaving(channelId)
    try {
      await props.onSave(channelId, token)
      setDrafts((current) => ({ ...current, [channelId]: '' }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Supplier tokens')}
      description={t(
        'Create a personal access token on the supplier site (a new-api site) and paste it here. It is stored on this server, never shown again, and only sent to that channel’s base URL to read /api/pricing.'
      )}
    >
      <ul className='divide-y'>
        {props.channels.map((channel) => (
          <li key={channel.id} className='space-y-2 py-3'>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <span className='font-medium'>{channel.name}</span>
              <span className='text-muted-foreground text-xs break-all'>
                {channel.base_url}
              </span>
              <StatusBadge
                size='sm'
                variant={channel.has_token ? 'success' : 'neutral'}
                label={channel.has_token ? t('Token set') : t('No token')}
              />
            </div>
            <div className='flex gap-2'>
              {/* A text field masked with CSS: browsers autofill saved
                  passwords into password fields, never into this one. */}
              <Input
                type='text'
                className='flex-1 [-webkit-text-security:disc]'
                autoComplete='off'
                spellCheck={false}
                data-1p-ignore
                data-lpignore='true'
                aria-label={t('Supplier token for {{name}}', {
                  name: channel.name,
                })}
                placeholder={
                  channel.has_token
                    ? t('Paste a new token to replace it')
                    : t('Paste supplier access token')
                }
                value={drafts[channel.id] ?? ''}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [channel.id]: event.target.value,
                  }))
                }
              />
              <Button
                size='sm'
                disabled={saving !== null || !(drafts[channel.id] ?? '').trim()}
                onClick={() => void save(channel.id, drafts[channel.id] ?? '')}
              >
                {t('Save')}
              </Button>
              {channel.has_token && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={saving !== null}
                  onClick={() => void save(channel.id, '')}
                >
                  {t('Clear')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
