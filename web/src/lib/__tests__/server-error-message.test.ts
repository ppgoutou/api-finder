import i18next from 'i18next'
import { beforeAll, describe, expect, test } from 'vitest'

import { getServerErrorMessage } from '../server-error-message'

const key = 'Model {{model}} is temporarily unavailable.'

beforeAll(async () => {
  await i18next.init({
    lng: 'zh',
    keySeparator: false,
    nsSeparator: false,
    resources: {
      zh: { translation: { [key]: '模型 {{model}} 暂时不可用。' } },
    },
  })
})

describe('getServerErrorMessage with a classified relay error', () => {
  test('nested error with message_key renders in the console language', () => {
    const error = {
      response: {
        data: {
          error: {
            message: 'Model m is temporarily unavailable. (request id: r)',
            message_key: key,
            message_params: { model: 'm' },
          },
        },
      },
    }
    expect(getServerErrorMessage(error)).toBe('模型 m 暂时不可用。')
  })

  test('nested error without message_key keeps the server text', () => {
    const error = { response: { data: { error: { message: 'Plain text' } } } }
    expect(getServerErrorMessage(error)).toBe('Plain text')
  })
})
