import { describe, expect, it } from 'vitest'
import { calloutAt } from './Dust2Callouts'

describe('calloutAt', () => {
  it('labels the T and CT pits', () => {
    expect(calloutAt(-25, 125)).toBe('T Spawn')
    expect(calloutAt(40, -80)).toBe('CT Spawn')
  })

  it('prefers specific site volumes over mid', () => {
    expect(calloutAt(95, -80)).toBe('A Site')
    expect(calloutAt(-105, -70)).toBe('B Site')
  })

  it('returns null outside the table', () => {
    expect(calloutAt(0, 400)).toBeNull()
  })
})
