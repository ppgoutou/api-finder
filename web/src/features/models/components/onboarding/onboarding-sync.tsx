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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listSystemTasks } from '@/features/system-settings/api'
import { formatTimestamp } from '@/lib/format'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { getDescriptionLLM, setDescriptionLLM } from '../../api'
import { modelsQueryKeys } from '../../lib'
import {
  SYNC_HISTORY_KEY,
  SYNC_TASK_TYPE,
  syncSummaryLines,
  type SyncTask,
} from '../../lib/onboarding-sync'

/** The last sync runs, scheduled or started here, with what each found. */
export function OnboardingSyncHistoryDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const history = useQuery({
    queryKey: [...SYNC_HISTORY_KEY, 'list'],
    queryFn: async () => {
      const response = await listSystemTasks(10, {
        scope: 'history',
        type: SYNC_TASK_TYPE,
      })
      if (!response.success || !Array.isArray(response.data)) {
        throw createServerError(response, t('We could not load system tasks.'))
      }
      return response.data as SyncTask[]
    },
    enabled: props.open,
  })

  let body = <LoadingState />
  if (history.isError) {
    body = (
      <ErrorState
        description={history.error.message}
        onRetry={() => void history.refetch()}
      />
    )
  } else if (history.data?.length === 0) {
    body = <EmptyState title={t('No sync runs yet')} />
  } else if (history.data) {
    body = (
      <ul className='divide-y'>
        {history.data.map((run) => (
          <li key={run.task_id} className='space-y-1 py-3'>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <StatusBadge
                size='sm'
                variant={run.status === 'failed' ? 'danger' : 'success'}
                label={t(run.status)}
                copyable={false}
              />
              <span className='text-muted-foreground'>
                {formatTimestamp(run.updated_at)}
              </span>
              <span className='text-muted-foreground text-xs'>
                {run.result?.detection
                  ? t('Started by hand')
                  : t('Scheduled price check')}
              </span>
            </div>
            {run.error && (
              <p className='text-destructive text-xs break-all'>{run.error}</p>
            )}
            <ul className='text-muted-foreground space-y-0.5 text-xs'>
              {syncSummaryLines(run.result, t).map((line) => (
                <li key={line} className='break-all'>
                  {line}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Sync history')}
      description={t(
        'Each run detects upstream models, checks supplier prices, adapts plugins and drafts metadata. Price checks also run every hour.'
      )}
    >
      {body}
    </Dialog>
  )
}

/** The OpenAI-compatible chat endpoint that polishes draft descriptions. */
export function DescriptionLLMDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const queryKey = [...modelsQueryKeys.all, 'onboarding', 'description-llm']
  const config = useQuery({
    queryKey,
    queryFn: async () => requireServerSuccess(await getDescriptionLLM()).data,
    enabled: props.open,
  })
  const [baseURL, setBaseURL] = useState<string | null>(null)
  const [modelName, setModelName] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const save = useMutation({
    mutationFn: async (clearKey: boolean) => {
      let key: string | undefined
      if (clearKey) key = ''
      else if (apiKey.trim()) key = apiKey.trim()
      return requireServerSuccess(
        await setDescriptionLLM({
          base_url: baseURL ?? config.data?.base_url ?? '',
          model: modelName ?? config.data?.model ?? '',
          api_key: key,
        })
      ).data
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved)
      setApiKey('')
      toast.success(t('Description writer saved'))
    },
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Description writer')}
      description={t(
        'An OpenAI-compatible chat model that rewrites draft descriptions in seven languages. Without it, drafts use a plain template. Replies that mention a price are dropped.'
      )}
    >
      {config.isPending ? (
        <LoadingState />
      ) : (
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='description-llm-base-url'>{t('Base URL')}</Label>
            <Input
              id='description-llm-base-url'
              placeholder='https://api.openai.com'
              value={baseURL ?? config.data?.base_url ?? ''}
              onChange={(event) => setBaseURL(event.target.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='description-llm-model'>{t('Model')}</Label>
            <Input
              id='description-llm-model'
              placeholder='gpt-4o-mini'
              value={modelName ?? config.data?.model ?? ''}
              onChange={(event) => setModelName(event.target.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='description-llm-key'>{t('API key')}</Label>
            {/* A text field masked with CSS: browsers autofill saved
                passwords into password fields, never into this one. */}
            <Input
              id='description-llm-key'
              type='text'
              className='[-webkit-text-security:disc]'
              autoComplete='off'
              spellCheck={false}
              data-1p-ignore
              data-lpignore='true'
              placeholder={
                config.data?.has_key
                  ? t('Paste a new key to replace it')
                  : t('Paste API key')
              }
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <div className='flex justify-end gap-2'>
            {config.data?.has_key && (
              <Button
                variant='outline'
                size='sm'
                disabled={save.isPending}
                onClick={() => save.mutate(true)}
              >
                {t('Clear key')}
              </Button>
            )}
            <Button
              size='sm'
              disabled={save.isPending}
              onClick={() => save.mutate(false)}
            >
              {save.isPending ? t('Saving...') : t('Save')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
