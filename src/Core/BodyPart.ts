export type BodyPart = 'head' | 'body' | 'legs'

/** KoS training damage vs 100 HP: head 1-tap, body 2-tap, legs 3-tap */
export const BODY_PART_DAMAGE: Record<BodyPart, number> = {
  head: 100,
  body: 51,
  legs: 34,
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
  return base
}
