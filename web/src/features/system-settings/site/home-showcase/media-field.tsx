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
import { ImageIcon, PlayCircle, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { handleServerError } from '@/lib/handle-server-error'

import { uploadHomeMedia } from '../../api'
import {
  HOME_MEDIA_MAX_IMAGE_BYTES,
  HOME_MEDIA_MAX_VIDEO_BYTES,
} from './schema'

type MediaFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  kind: 'video' | 'image'
}

/**
 * One media slot: preview, upload button with progress, and the stored URL,
 * which can also be an https link pasted by hand.
 */
export function MediaField<T extends FieldValues>(props: MediaFieldProps<T>) {
  const { t } = useTranslation()
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const isVideo = props.kind === 'video'

  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => {
        const value = typeof field.value === 'string' ? field.value : ''

        const upload = async (file: File | undefined) => {
          if (!file) return
          const limit = isVideo
            ? HOME_MEDIA_MAX_VIDEO_BYTES
            : HOME_MEDIA_MAX_IMAGE_BYTES
          if (file.size > limit) {
            toast.error(
              t(
                'The file is too large. Videos can be up to 95 MB and images up to 10 MB.'
              )
            )
            return
          }
          setProgress(0)
          try {
            const response = await uploadHomeMedia(file, setProgress)
            if (response.success && response.data?.url) {
              field.onChange(response.data.url)
            } else {
              handleServerError(response, t('Upload failed'))
            }
          } catch (error) {
            handleServerError(error, t('Upload failed'))
          } finally {
            setProgress(null)
          }
        }

        return (
          <FormItem>
            <FormLabel>{props.label}</FormLabel>
            <div className='flex flex-wrap items-start gap-3'>
              <div className='bg-muted flex aspect-video w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border'>
                {value && isVideo && (
                  <video
                    src={value}
                    muted
                    preload='metadata'
                    className='size-full object-cover'
                    aria-label={props.label}
                  />
                )}
                {value && !isVideo && (
                  <img
                    src={value}
                    alt={props.label}
                    className='size-full object-cover'
                  />
                )}
                {!value &&
                  (isVideo ? (
                    <PlayCircle
                      className='text-muted-foreground size-6'
                      aria-hidden
                    />
                  ) : (
                    <ImageIcon
                      className='text-muted-foreground size-6'
                      aria-hidden
                    />
                  ))}
              </div>
              <div className='flex min-w-0 flex-1 flex-col gap-2'>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={progress !== null}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload data-icon='inline-start' />
                    {isVideo ? t('Upload video') : t('Upload image')}
                  </Button>
                  {value && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={progress !== null}
                      onClick={() => field.onChange('')}
                    >
                      <Trash2 data-icon='inline-start' />
                      {t('Remove')}
                    </Button>
                  )}
                </div>
                {/* sr-only rather than hidden so the label stays reachable to
                  a screen reader and to userEvent.upload in tests. */}
                <label className='sr-only' htmlFor={inputId}>
                  {t('Choose file for {{label}}', { label: props.label })}
                </label>
                <input
                  ref={fileInputRef}
                  id={inputId}
                  type='file'
                  accept={
                    isVideo
                      ? 'video/mp4,video/webm'
                      : 'image/jpeg,image/png,image/webp'
                  }
                  className='sr-only'
                  onChange={(event) => {
                    void upload(event.target.files?.[0])
                    // Allow choosing the same file again after an error.
                    event.target.value = ''
                  }}
                />
                {progress !== null && (
                  <Progress
                    value={progress}
                    aria-label={t('Upload progress')}
                  />
                )}
                <FormControl>
                  <Input
                    {...field}
                    value={value}
                    placeholder={t('Uploaded file or https link')}
                    aria-label={t('{{label}} URL', { label: props.label })}
                  />
                </FormControl>
                <FormMessage />
              </div>
            </div>
          </FormItem>
        )
      }}
    />
  )
}
