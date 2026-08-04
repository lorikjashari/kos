import { describe, expect, it } from 'vitest'
import { damageAtRange, damageForBodyPart } from './BodyPart'
import { getWeaponConfig } from './Weapon'

describe('damageAtRange', () => {
  it('keeps headshots lethal at any distance', () => {
    expect(damageAtRange('head', 'AK47', 0)).toBe(100)
    expect(damageAtRange('head', 'AK47', 500)).toBe(100)
  })

  it('does not taper inside the falloff start', () => {
    const ak = getWeaponConfig('AK47')
    expect(damageAtRange('body', 'AK47', 0)).toBe(damageForBodyPart('body', 'AK47'))
    expect(damageAtRange('body', 'AK47', ak.falloffStart)).toBe(damageForBodyPart('body', 'AK47'))
  })

  it('tapers body damage with distance but never past the floor', () => {
    const base = damageForBodyPart('body', 'AK47')
    const ak = getWeaponConfig('AK47')
    const mid = damageAtRange('body', 'AK47', (ak.falloffStart + ak.falloffEnd) / 2)
    const far = damageAtRange('body', 'AK47', ak.falloffEnd)
    const beyond = damageAtRange('body', 'AK47', ak.falloffEnd * 10)

    expect(mid).toBeLessThan(base)
    expect(far).toBeLessThan(mid)
    expect(far).toBe(Math.round(base * ak.damageFalloffMin))
    expect(beyond).toBe(far)
  })

  it('leaves the AWP untouched so it stays a sniper', () => {
    expect(damageAtRange('body', 'AWP', 1000)).toBe(damageForBodyPart('body', 'AWP'))
  })

  it('always leaves at least one point of damage', () => {
    expect(damageAtRange('legs', 'Usp', 9999)).toBeGreaterThan(0)
  })

  it('gives USP a stronger body shot than the AK baseline table', () => {
    expect(damageForBodyPart('body', 'Usp')).toBe(55)
    expect(damageForBodyPart('body', 'AK47')).toBe(51)
    expect(damageForBodyPart('legs', 'Usp')).toBe(36)
  })

  it('keeps knife stronger than USP at melee range for body', () => {
    expect(damageForBodyPart('body', 'Knife')).toBeGreaterThan(damageForBodyPart('body', 'Usp'))
  })

  it('keeps AWP body as a one-tap', () => {
    expect(damageForBodyPart('body', 'AWP')).toBe(100)
  })
})
