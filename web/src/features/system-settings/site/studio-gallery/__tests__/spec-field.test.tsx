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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { Form } from '@/components/ui/form'
import type { StudioModel } from '@/features/video-studio/constants'

import { GallerySpecField } from '../spec-field'

const SERIES: StudioModel[] = [
  {
    name: 'Seedance 2.0',
    resolutions: ['480p', '720p', '1080p'],
    duration: [4, 15],
    ratios: ['auto', '16:9', '9:16', '1:1'],
  },
  {
    name: 'Wan 3.0',
    resolutions: ['720p'],
    duration: [5, 10],
    durations: [5, 10],
    ratios: ['auto', '9:16', '1:1'],
  },
]

function Fixture(props: { spec: string }) {
  const form = useForm<{ spec: string }>({
    defaultValues: { spec: props.spec },
  })
  const spec = useWatch({ control: form.control, name: 'spec' })
  return (
    <Form {...form}>
      <GallerySpecField control={form.control} name='spec' series={SERIES} />
      <output aria-label='Stored spec'>{spec}</output>
    </Form>
  )
}

async function pick(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('gallery spec picker', () => {
  it('fills the standard parameters of a picked model on a new work', async () => {
    render(<Fixture spec='' />)

    await pick('Model', 'Seedance 2.0')

    expect(screen.getByLabelText('Stored spec')).toHaveTextContent(
      'Seedance 2.0 · 16:9 · 1080p · 5s'
    )
  })

  it('moves ratio, resolution and duration to what a newly picked model takes', async () => {
    render(<Fixture spec='Seedance 2.0 · 16:9 · 1080p · 7s' />)

    await pick('Model', 'Wan 3.0')

    expect(screen.getByLabelText('Stored spec')).toHaveTextContent(
      'Wan 3.0 · 9:16 · 720p · 5s'
    )
  })

  it('offers only the durations the model lists', async () => {
    render(<Fixture spec='Wan 3.0 · 9:16 · 720p · 5s' />)

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Video duration' })
    )

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['5s', '10s'])
  })

  it('keeps a saved model that is no longer offered visible as unavailable', () => {
    render(<Fixture spec='old-model · 720p · 5s' />)

    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'old-model (not available)'
    )
    expect(screen.getByRole('combobox', { name: 'Resolution' })).toBeDisabled()
  })
})
