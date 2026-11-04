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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface AffiliateAvatarProps {
  /** Invitee name or email; its first character is shown. */
  label?: string
}

/** Decorative initial shown in front of a referral list row. */
export function AffiliateAvatar(props: AffiliateAvatarProps) {
  const initial = [...(props.label?.trim() ?? '')][0]?.toUpperCase() ?? '?'
  return (
    <Avatar aria-hidden='true' className='size-9 after:border-0'>
      <AvatarFallback className='text-sm font-semibold'>
        {initial}
      </AvatarFallback>
    </Avatar>
  )
}
