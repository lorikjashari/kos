import { describe, expect, it } from 'vitest'
import { MP_FILL_BOTS, botTargetForHumans, makeRoomCode, peerIdForRoom } from './NetTypes'

describe('botTargetForHumans', () => {
  it('uses the full fill for a solo host', () => {
    expect(botTargetForHumans(1, 10)).toBe(10)
  })

  it('drops one bot per extra human so the lobby size stays put', () => {
    expect(botTargetForHumans(2, 10)).toBe(9)
    expect(botTargetForHumans(5, 10)).toBe(6)
  })

  it('never goes negative once humans outnumber the fill', () => {
    expect(botTargetForHumans(15, 2)).toBe(0)
  })

  it('honours a pure-PvP room', () => {
    expect(botTargetForHumans(3, 0)).toBe(0)
  })

  it('clamps a fill above the cap', () => {
    expect(botTargetForHumans(1, 999)).toBe(MP_FILL_BOTS)
  })
})

describe('room codes', () => {
  it('is six characters of unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = makeRoomCode()
      expect(code).toHaveLength(6)
      // No 0/O/1/I — they get misread when a code is typed from a screenshot
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })

  it('normalises case and whitespace when building the peer id', () => {
    expect(peerIdForRoom(' abc123 ')).toBe('kos-room-ABC123')
  })
})
