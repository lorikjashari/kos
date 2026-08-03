import { describe, expect, it } from 'vitest'
import { PLAYER_CENTER_OFFSET, deriveSpawnsFromGeometry, flatDistXZ, type ProbeFn } from './MapCatalog'

const BOUNDS_MIN = { x: -100, y: 0, z: -100 }
const BOUNDS_MAX = { x: 100, y: 40, z: 100 }

/** Flat floor at y=0 with open sky. */
const openFloor: ProbeFn = (from, to) => {
  const goingDown = to.y < from.y
  if (!goingDown) return { hasHit: false }
  return { hasHit: true, point: { x: from.x, y: 0, z: from.z }, normal: { x: 0, y: 1, z: 0 } }
}

describe('deriveSpawnsFromGeometry', () => {
  it('finds standing room on an open floor', () => {
    const spawns = deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, openFloor)
    expect(spawns.length).toBeGreaterThan(4)
  })

  it('lifts spawns to the capsule centre rather than leaving them at floor level', () => {
    const spawns = deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, openFloor)
    for (const s of spawns) expect(s.y).toBe(PLAYER_CENTER_OFFSET)
  })

  it('spreads spawns apart so players do not land on each other', () => {
    const spawns = deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, openFloor)
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        expect(flatDistXZ(spawns[i].x, spawns[i].z, spawns[j].x, spawns[j].z)).toBeGreaterThan(1)
      }
    }
  })

  it('rejects ground too steep to stand on', () => {
    const steep: ProbeFn = (from, to) =>
      to.y < from.y
        ? { hasHit: true, point: { x: from.x, y: 0, z: from.z }, normal: { x: 0.9, y: 0.2, z: 0 } }
        : { hasHit: false }
    expect(deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, steep)).toHaveLength(0)
  })

  it('rejects places with no headroom for the capsule', () => {
    const crawlspace: ProbeFn = (from, to) => {
      if (to.y < from.y) return { hasHit: true, point: { x: from.x, y: 0, z: from.z }, normal: { x: 0, y: 1, z: 0 } }
      // Upward headroom probe always blocked
      return { hasHit: true, point: { x: from.x, y: from.y, z: from.z }, normal: { x: 0, y: -1, z: 0 } }
    }
    expect(deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, crawlspace)).toHaveLength(0)
  })

  it('prefers the dominant floor over a small raised platform', () => {
    // A tall pillar in one corner should not attract spawns away from the floor
    const withPillar: ProbeFn = (from, to) => {
      if (to.y >= from.y) return { hasHit: false }
      const onPillar = from.x > 80 && from.z > 80
      const y = onPillar ? 30 : 0
      return { hasHit: true, point: { x: from.x, y, z: from.z }, normal: { x: 0, y: 1, z: 0 } }
    }
    const spawns = deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, withPillar)
    expect(spawns.length).toBeGreaterThan(0)
    for (const s of spawns) expect(s.y).toBeLessThan(20)
  })

  it('returns nothing when the map has no floor at all', () => {
    expect(deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MAX, () => ({ hasHit: false }))).toHaveLength(0)
  })

  it('handles degenerate bounds without throwing', () => {
    expect(deriveSpawnsFromGeometry(BOUNDS_MIN, BOUNDS_MIN, openFloor)).toHaveLength(0)
  })
})
