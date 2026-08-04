import { describe, expect, it } from 'vitest'
import {
  authorizeHit,
  isKnownWeapon,
  sanitizePlayerVitals,
  type HitPose,
} from './HitValidation'

const aliveAt = (x: number, z: number, team?: 'T' | 'CT'): HitPose => ({
  x,
  y: 10,
  z,
  alive: true,
  team: team ?? null,
})

describe('authorizeHit', () => {
  it('recomputes damage and ignores client numbers', () => {
    const r = authorizeHit({
      fromId: 'p1',
      claimedAttackerName: 'Ace',
      knownAttackerName: 'Ace',
      weapon: 'AK47',
      headshot: true,
      targetId: 'player:p2',
      attacker: aliveAt(0, 0),
      target: aliveAt(5, 0),
      nowMs: 1000,
      lastHitAtMs: 0,
      teamPlay: false,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.damage).toBe(100)
      expect(r.part).toBe('head')
    }
  })

  it('rejects name spoof, bad weapon, rate limit, and FF', () => {
    const base = {
      fromId: 'p1',
      claimedAttackerName: 'Ace',
      knownAttackerName: 'Ace',
      weapon: 'AK47',
      headshot: false,
      targetId: 'player:p2',
      attacker: aliveAt(0, 0, 'T'),
      target: aliveAt(5, 0, 'T'),
      nowMs: 1000,
      lastHitAtMs: 0,
      teamPlay: true,
    }
    expect(authorizeHit({ ...base, claimedAttackerName: 'Other' }).ok).toBe(false)
    expect(authorizeHit({ ...base, weapon: 'RPG', teamPlay: false, target: aliveAt(5, 0, 'CT') }).ok).toBe(
      false
    )
    expect(authorizeHit({ ...base, lastHitAtMs: 990, teamPlay: false, target: aliveAt(5, 0, 'CT') }).ok).toBe(
      false
    )
    expect(authorizeHit(base).ok).toBe(false) // FF
  })

  it('rejects out of range and dead targets', () => {
    expect(
      authorizeHit({
        fromId: 'p1',
        claimedAttackerName: 'Ace',
        knownAttackerName: 'Ace',
        weapon: 'AK47',
        headshot: false,
        targetId: 'bot:X',
        attacker: aliveAt(0, 0),
        target: aliveAt(500, 0),
        nowMs: 1000,
        lastHitAtMs: 0,
        teamPlay: false,
      }).ok
    ).toBe(false)

    expect(
      authorizeHit({
        fromId: 'p1',
        claimedAttackerName: 'Ace',
        knownAttackerName: 'Ace',
        weapon: 'Usp',
        headshot: false,
        targetId: 'bot:X',
        attacker: aliveAt(0, 0),
        target: { ...aliveAt(5, 0), alive: false },
        nowMs: 1000,
        lastHitAtMs: 0,
        teamPlay: false,
      }).ok
    ).toBe(false)
  })
})

describe('sanitizePlayerVitals', () => {
  it('clamps and forces dead when hp is zero', () => {
    expect(sanitizePlayerVitals(150, -3, true)).toEqual({ hp: 100, armor: 0, alive: true })
    expect(sanitizePlayerVitals(0, 50, true)).toEqual({ hp: 0, armor: 50, alive: false })
    expect(sanitizePlayerVitals(80, 40, false)).toEqual({ hp: 0, armor: 40, alive: false })
  })
})

describe('isKnownWeapon', () => {
  it('accepts loadout keys only', () => {
    expect(isKnownWeapon('AK47')).toBe(true)
    expect(isKnownWeapon('Knife')).toBe(true)
    expect(isKnownWeapon('nope')).toBe(false)
  })
})
