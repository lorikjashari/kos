import { damageAtRange, type BodyPart } from '../Core/BodyPart'
import { isCsMdlKnifeKey } from '../View/Mesh/GoldSrc/CsMdlKnife'
import { WEAPONS } from '../Core/Weapon'
import type { Team } from '../Core/Teams'

/** World-space max hit distance (Dust II scaled + slack). */
export const MAX_HIT_RANGE = 220

/** Floor between accepted hits from one peer (ms) — blocks spray spoof floods. */
export const MIN_HIT_INTERVAL_MS = 45

export type HitPose = {
  x: number
  y: number
  z: number
  alive: boolean
  team?: Team | null
  weapon?: string
}

export type AuthorizeHitInput = {
  fromId: string
  claimedAttackerName: string
  knownAttackerName: string
  weapon: string
  headshot: boolean
  targetId: string
  attacker: HitPose | null
  target: HitPose | null
  nowMs: number
  lastHitAtMs: number
  teamPlay: boolean
}

export type AuthorizeHitResult =
  | { ok: true; damage: number; part: BodyPart; distance: number; attackerName: string; weapon: string }
  | { ok: false; reason: string }

export function isKnownWeapon(weapon: string): boolean {
  return Object.prototype.hasOwnProperty.call(WEAPONS, weapon)
}

export function flatDist(a: HitPose, b: HitPose): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Host-side authorization: recompute damage, bind attacker identity, rate-limit,
 * reject FF / out-of-range / unknown weapons. Client damage numbers are ignored.
 */
export function authorizeHit(input: AuthorizeHitInput): AuthorizeHitResult {
  const {
    claimedAttackerName,
    knownAttackerName,
    weapon,
    headshot,
    targetId,
    attacker,
    target,
    nowMs,
    lastHitAtMs,
    teamPlay,
  } = input

  if (!knownAttackerName) return { ok: false, reason: 'unknown_attacker' }
  // Clients must not spoof someone else's killfeed name
  if (claimedAttackerName && claimedAttackerName !== knownAttackerName) {
    return { ok: false, reason: 'name_mismatch' }
  }
  if (!isKnownWeapon(weapon)) return { ok: false, reason: 'bad_weapon' }
  if (nowMs - lastHitAtMs < MIN_HIT_INTERVAL_MS) return { ok: false, reason: 'rate_limit' }
  if (!attacker?.alive) return { ok: false, reason: 'attacker_dead' }
  if (!target?.alive) return { ok: false, reason: 'target_dead' }

  if (teamPlay && attacker.team && target.team && attacker.team === target.team) {
    return { ok: false, reason: 'friendly_fire' }
  }

  // Knife claims beyond melee are rejected; guns use the global max
  const maxRange =
    weapon === 'Knife' || isCsMdlKnifeKey(weapon)
      ? (WEAPONS.Knife?.maxRange ?? 3) + 1.5
      : MAX_HIT_RANGE
  const distance = flatDist(attacker, target)
  if (distance > maxRange) return { ok: false, reason: 'range' }

  const part: BodyPart = headshot ? 'head' : 'body'
  const damage = damageAtRange(part, weapon, distance)
  if (damage <= 0) return { ok: false, reason: 'zero_damage' }

  // targetId kept for callers; empty rejected upstream
  if (!targetId) return { ok: false, reason: 'bad_target' }

  return {
    ok: true,
    damage,
    part,
    distance,
    attackerName: knownAttackerName,
    weapon,
  }
}

/** Clamp pose vitals from untrusted client snapshots. */
export function sanitizePlayerVitals(hp: number, armor: number, alive: boolean): {
  hp: number
  armor: number
  alive: boolean
} {
  const h = Number.isFinite(hp) ? Math.max(0, Math.min(100, Math.round(hp))) : 0
  const a = Number.isFinite(armor) ? Math.max(0, Math.min(100, Math.round(armor))) : 0
  const living = !!alive && h > 0
  return { hp: living ? Math.max(1, h) : 0, armor: a, alive: living }
}
