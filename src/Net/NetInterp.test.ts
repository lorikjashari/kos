import { describe, expect, it } from 'vitest'
import { NetPoseBuffer, clampInterpDelay, lerpAngle } from './NetInterp'

describe('NetPoseBuffer', () => {
  it('lerps between two samples', () => {
    const buf = new NetPoseBuffer()
    buf.push({ t: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })
    buf.push({ t: 2, x: 10, y: 0, z: 0, yaw: 0, pitch: 0 })
    const mid = buf.sampleAt(1.5)
    expect(mid?.x).toBeCloseTo(5, 5)
  })

  it('clamps before first and after last', () => {
    const buf = new NetPoseBuffer()
    buf.push({ t: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })
    buf.push({ t: 2, x: 10, y: 0, z: 0, yaw: 0, pitch: 0 })
    expect(buf.sampleAt(0)?.x).toBe(0)
    expect(buf.sampleAt(9)?.x).toBe(10)
  })
})

describe('lerpAngle', () => {
  it('takes the short arc', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 5)
  })
})

describe('clampInterpDelay', () => {
  it('bounds delay', () => {
    expect(clampInterpDelay(0)).toBe(0.03)
    expect(clampInterpDelay(1)).toBe(0.25)
    expect(clampInterpDelay(0.1)).toBe(0.1)
  })
})
