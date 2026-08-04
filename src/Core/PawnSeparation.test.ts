import { describe, expect, it } from 'vitest'
import { separatePair } from './PawnSeparation'

describe('separatePair', () => {
  it('returns null when already apart', () => {
    expect(separatePair({ x: 0, z: 0 }, { x: 5, z: 0 }, 2)).toBeNull()
  })

  it('pushes stacked bodies apart', () => {
    const out = separatePair({ x: 0, z: 0 }, { x: 0, z: 0 }, 2)
    expect(out).toBeTruthy()
    const dx = out!.a.x - out!.b.x
    const dz = out!.a.z - out!.b.z
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(1.99)
  })

  it('splits overlap by weight', () => {
    const out = separatePair({ x: 0, z: 0 }, { x: 1, z: 0 }, 2, 1)
    expect(out).toBeTruthy()
    // aWeight=1 → a absorbs the full separation; gap becomes >= 2
    expect(Math.abs(out!.a.x - out!.b.x)).toBeGreaterThanOrEqual(1.99)
    expect(out!.b.x).toBeCloseTo(1, 5)
  })
})
