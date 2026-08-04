import { describe, expect, it } from 'vitest'
import { shouldRenderFrame } from './FramePacing'
import { clampFpsCap } from '../UI/ConsoleParse'

describe('clampFpsCap', () => {
  it('treats 0 as uncapped', () => {
    expect(clampFpsCap(0)).toBe(0)
    expect(clampFpsCap(-5)).toBe(0)
  })

  it('raises tiny caps to 24', () => {
    expect(clampFpsCap(15)).toBe(24)
  })

  it('clamps huge values', () => {
    expect(clampFpsCap(5000)).toBe(999)
  })
})

describe('shouldRenderFrame', () => {
  it('always renders when uncapped', () => {
    expect(shouldRenderFrame(1000, 0, 0)).toEqual({ render: true, lastFrameTS: 1000 })
  })

  it('skips frames inside the min interval', () => {
    const a = shouldRenderFrame(0, 60, -1)
    expect(a.render).toBe(true)
    const b = shouldRenderFrame(5, 60, a.lastFrameTS)
    expect(b.render).toBe(false)
    const c = shouldRenderFrame(20, 60, a.lastFrameTS)
    expect(c.render).toBe(true)
  })
})
