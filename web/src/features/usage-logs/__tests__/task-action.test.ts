import { describe, expect, test } from 'vitest'

import { taskActionMapper } from '../lib/mappers'

describe('taskActionMapper', () => {
  test.each([
    ['text_to_video', 'Text to Video'],
    ['image_to_video', 'Image to Video'],
    ['first_tail_to_video', 'First/Last Frame to Video'],
    ['reference_to_video', 'Reference Video'],
    ['remix', 'Video Remix'],
    ['text_to_image', 'Text to Image'],
    ['image_to_image', 'Image to Image'],
  ])('canonical action %s is labelled %s', (action, label) => {
    expect(taskActionMapper.getLabel(action)).toBe(label)
  })

  test.each([
    ['generate', 'Image to Video'],
    ['textGenerate', 'Text to Video'],
    ['firstTailGenerate', 'First/Last Frame to Video'],
    ['referenceGenerate', 'Reference Video'],
    ['remixGenerate', 'Video Remix'],
  ])('legacy stored action %s keeps label %s', (action, label) => {
    expect(taskActionMapper.getLabel(action)).toBe(label)
  })

  test('an action the console does not know falls back to Unknown', () => {
    expect(taskActionMapper.getLabel('custom_action')).toBe('Unknown')
  })
})
