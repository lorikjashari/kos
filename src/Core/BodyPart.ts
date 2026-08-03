import { getWeaponConfig } from './Weapon'

export type BodyPart = 'head' | 'body' | 'legs'

/** KoS training damage vs 100 HP: head 1-tap, body 2-tap, legs 3-tap */
export const BODY_PART_DAMAGE: Record<BodyPart, number> = {
  head: 100,
  body: 51,
  legs: 34,
}

/**
 * Distance-scaled damage. Headshots keep their one-tap identity at any range —
 * only body and leg hits taper, so pushing closer is what turns a two-tap into a
 * two-tap instead of a three.
 */
export function damageAtRange(part: BodyPart, weaponKey: string, distance: number): number {
  const base = damageForBodyPart(part, weaponKey)
  if (part === 'head') return base
  const weapon = getWeaponConfig(weaponKey)
  const { falloffStart, falloffEnd, damageFalloffMin } = weapon
  if (falloffEnd <= falloffStart || distance <= falloffStart) return base
  const t = Math.min(1, (distance - falloffStart) / (falloffEnd - falloffStart))
  return Math.max(1, Math.round(base * (1 - t * (1 - damageFalloffMin))))
}

export function damageForBodyPart(part: BodyPart, weaponKey: string): number {
  const base = BODY_PART_DAMAGE[part]
  if (weaponKey === 'Knife') {
    if (part === 'head') return 100
    if (part === 'body') return 65
    return 40
  }
  if (weaponKey === 'Usp') {
    // Same 1/2/3 tap profile as AK for the training bot
    return base
  }
  if (weaponKey === 'AWP') {
    if (part === 'head') return 100
    if (part === 'body') return 100
    return 85
  }
  return base
}
