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
import { motion, useReducedMotion, useSpring } from 'motion/react'
import type { PointerEvent, ReactNode } from 'react'

import { CARD_ITEM_VARIANTS } from '@/lib/motion'

import { getCardTilt } from '../lib/card-tilt'

const TILT_SPRING = { stiffness: 260, damping: 26 }

interface WalletTiltCardProps {
  children: ReactNode
  className?: string
}

/**
 * Enters with the page's card stagger and leans toward the mouse. The outer
 * element stays still so its bounds do not shift under the pointer as the card
 * rotates.
 */
export function WalletTiltCard(props: WalletTiltCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const rotateX = useSpring(0, TILT_SPRING)
  const rotateY = useSpring(0, TILT_SPRING)

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const isTyping = event.currentTarget.querySelector('input:focus') !== null
    if (shouldReduceMotion || event.pointerType !== 'mouse' || isTyping) {
      rotateX.set(0)
      rotateY.set(0)
      return
    }
    const tilt = getCardTilt(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY
    )
    rotateX.set(tilt.rotateX)
    rotateY.set(tilt.rotateY)
  }

  const handlePointerLeave = () => {
    rotateX.set(0)
    rotateY.set(0)
  }

  return (
    <div
      className={props.className}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        variants={CARD_ITEM_VARIANTS}
        style={{ rotateX, rotateY, transformPerspective: 1200 }}
        className='h-full'
      >
        {props.children}
      </motion.div>
    </div>
  )
}
