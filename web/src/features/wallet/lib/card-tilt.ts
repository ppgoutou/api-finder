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
const MAX_TILT_DEGREES = 3.5
/** Keeps wide cards from swinging further at their edges than narrow ones. */
const MAX_EDGE_SHIFT_PX = 16

function maxTiltFor(size: number): number {
  const edgeLimitDegrees = (MAX_EDGE_SHIFT_PX / (size / 2)) * (180 / Math.PI)
  return Math.min(MAX_TILT_DEGREES, edgeLimitDegrees)
}

/** Rotation that leans a card toward the pointer; zero at its center. */
export function getCardTilt(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number
): { rotateX: number; rotateY: number } {
  const offsetX = (clientX - rect.left) / rect.width - 0.5
  const offsetY = (clientY - rect.top) / rect.height - 0.5
  return {
    rotateX: offsetY * -2 * maxTiltFor(rect.height),
    rotateY: offsetX * 2 * maxTiltFor(rect.width),
  }
}
