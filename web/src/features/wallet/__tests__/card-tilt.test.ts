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
import { expect, it } from 'vitest'

import { getCardTilt } from '../lib/card-tilt'

const narrowCard = { left: 100, top: 50, width: 400, height: 300 }

it('leaves the card flat when the pointer is at its center', () => {
  const tilt = getCardTilt(narrowCard, 300, 200)

  expect(tilt.rotateX).toBeCloseTo(0)
  expect(tilt.rotateY).toBeCloseTo(0)
})

it('leans toward the pointer at the bottom-right corner', () => {
  const tilt = getCardTilt(narrowCard, 500, 350)

  expect(tilt.rotateX).toBeCloseTo(-3.5)
  expect(tilt.rotateY).toBeCloseTo(3.5)
})

it('tilts a full-width card less so its edges do not swing further', () => {
  const wideCard = { left: 0, top: 0, width: 1280, height: 300 }

  const tilt = getCardTilt(wideCard, 1280, 150)

  expect(tilt.rotateY).toBeGreaterThan(1)
  expect(tilt.rotateY).toBeLessThan(2)
})
