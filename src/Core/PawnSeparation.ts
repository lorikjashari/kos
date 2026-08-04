/**
 * Soft XZ separation for kinematic bots / player capsules.
 * Pure math — no Game dependency (unit-tested).
 */

export type SepPos = { x: number; z: number }

/** Push two points apart on XZ so distance >= minDist. Splits the overlap. */
export function separatePair(
  a: SepPos,
  b: SepPos,
  minDist: number,
  aWeight = 0.5
): { a: SepPos; b: SepPos } | null {
  const dx = a.x - b.x
  const dz = a.z - b.z
  const distSq = dx * dx + dz * dz
  const minSq = minDist * minDist
  if (distSq >= minSq || minDist <= 0) return null

  let dist = Math.sqrt(distSq)
  let nx: number
  let nz: number
  if (dist < 1e-5) {
    // Stacked — arbitrary axis so they don't stay glued
    nx = 1
    nz = 0
    dist = 0
  } else {
    nx = dx / dist
    nz = dz / dist
  }

  const overlap = minDist - dist
  const wA = Math.max(0, Math.min(1, aWeight))
  const wB = 1 - wA
  return {
    a: { x: a.x + nx * overlap * wA, z: a.z + nz * overlap * wA },
    b: { x: b.x - nx * overlap * wB, z: b.z - nz * overlap * wB },
  }
}
