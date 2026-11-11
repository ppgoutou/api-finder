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

import type { PricingModel } from '../types'

/** Suffix that marks a model as offering unrestricted content. */
const UNRESTRICTED_SUFFIX = '-P'

type PricingHeroNoteProps = {
  /** Models the viewer's groups can use. */
  models: PricingModel[]
}

/**
 * The note under the model plaza title. Viewers whose groups include
 * unrestricted models learn how to spot them; everyone else is told to ask
 * support for access, since those models are hidden from them.
 */
export function PricingHeroNote(props: PricingHeroNoteProps) {
  const { t } = useTranslation()
  const offersUnrestricted = props.models.some((model) =>
    model.model_name.endsWith(UNRESTRICTED_SUFFIX)
  )

  return (
    <p className='text-muted-foreground/60 mx-auto mt-3 max-w-3xl text-xs leading-relaxed sm:text-sm'>
      {offersUnrestricted
        ? t(
            'Multi-channel groups billed per second, per token or per request, pick what fits; models ending in {{suffix}} offer unrestricted content.',
            { suffix: UNRESTRICTED_SUFFIX }
          )
        : t(
            'Multi-channel groups billed per second, per token or per request, pick what fits; contact support for unrestricted content models.'
          )}
    </p>
  )
}
