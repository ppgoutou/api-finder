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
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LanguageBlocksTextarea } from '@/components/language-blocks-textarea'

function Harness(props: { initial: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(props.initial)
  return (
    <LanguageBlocksTextarea
      aria-label='Description'
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onSave(next)
      }}
    />
  )
}

const MULTILINGUAL =
  '<!-- lang:zh -->\n每张图片固定单价。\n<!-- lang:en -->\nA fixed price per image.'

describe('LanguageBlocksTextarea', () => {
  it('opens on the Chinese version without showing markers', () => {
    render(<Harness initial={MULTILINGUAL} onSave={vi.fn()} />)

    expect(screen.getByRole('tab', { name: '简体中文' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByLabelText('Description')).toHaveValue(
      '每张图片固定单价。'
    )
  })

  it('shows replaced text when the value changes from outside a picked tab', () => {
    const { rerender } = render(
      <LanguageBlocksTextarea
        aria-label='Description'
        value={MULTILINGUAL}
        onChange={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'English' }))

    rerender(
      <LanguageBlocksTextarea
        aria-label='Description'
        value='Supplier text'
        onChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Description')).toHaveValue('Supplier text')
  })

  it('edits only the selected language and keeps the others', () => {
    const onSave = vi.fn()
    render(<Harness initial={MULTILINGUAL} onSave={onSave} />)

    fireEvent.click(screen.getByRole('tab', { name: 'English' }))
    expect(screen.getByLabelText('Description')).toHaveValue(
      'A fixed price per image.'
    )
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'One price per image.' },
    })

    expect(onSave).toHaveBeenLastCalledWith(
      '<!-- lang:zh -->\n每张图片固定单价。\n<!-- lang:en -->\nOne price per image.'
    )
  })

  it('opens unmarked content on the shared text and saves it unchanged', () => {
    const onSave = vi.fn()
    render(<Harness initial='Plain description' onSave={onSave} />)

    expect(screen.getByLabelText('Description')).toHaveValue(
      'Plain description'
    )
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Plain description 2' },
    })

    expect(onSave).toHaveBeenLastCalledWith('Plain description 2')
  })

  it('keeps trailing spaces while typing a language block', () => {
    render(<Harness initial='' onSave={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: '你好 ' },
    })

    expect(screen.getByLabelText('Description')).toHaveValue('你好 ')
  })
})
