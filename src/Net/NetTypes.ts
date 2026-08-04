import type { TeamMode } from '../Core/MatchStats'
import type { Team } from '../Core/Teams'

export type NetRole = 'host' | 'client' | 'offline'

export type NetHuman = { id: string; name: string; team?: Team }

export type NetMsg =
  | { t: 'hello'; name: string; peerId: string }
  | {
      t: 'welcome'
      hostName: string
      humans: NetHuman[]
      botTarget: number
      teamMode: TeamMode
      mapId?: 'pool_day' | 'de_dust2'
      /** Host is running T vs CT */
      teamPlay?: boolean
      teamSize?: number
    }
  | {
      t: 'roster'
      humans: NetHuman[]
      botTarget: number
      teamMode: TeamMode
      mapId?: 'pool_day' | 'de_dust2'
      teamPlay?: boolean
      teamSize?: number
    }
  | {
      t: 'player'
      id: string
      name: string
      x: number
      y: number
      z: number
      yaw: number
      pitch: number
      hp: number
      armor: number
      alive: boolean
      weapon: string
      moving: boolean
      crouch?: boolean
      shoot?: boolean
      /** Local-space move intent: mx = right/left, mz = forward/back (-1..1) */
      mx?: number
      mz?: number
      air?: boolean
      reload?: boolean
    }
  | {
      t: 'bots'
      list: Array<{
        name: string
        x: number
        y: number
        z: number
        yaw: number
        hp: number
        alive: boolean
        weapon: string
        moving: boolean
        shoot: boolean
        team?: Team
      }>
    }
  | {
      t: 'hit'
      targetId: string
      damage: number
      headshot: boolean
      attackerName: string
      weapon: string
    }
  | {
      t: 'killfeed'
      killer: string
      victim: string
      weapon: string
      headshot: boolean
    }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }
  | { t: 'reject'; reason: string }

export const MP_FILL_BOTS = 10
/** Cap humans per room — kept in sync with the public room directory. */
export const MP_MAX_HUMANS = 10
export const MP_TICK_HZ = 20

/** Host-chosen fill (0 = pure PvP). Extra humans replace bots: 2 players + fill 10 → 9 bots. */
export function botTargetForHumans(humanCount: number, fillBots = MP_FILL_BOTS): number {
  const n = Math.max(1, Math.min(MP_MAX_HUMANS, humanCount))
  const fill = Math.max(0, Math.min(MP_FILL_BOTS, Math.round(fillBots)))
  return Math.max(0, fill - (n - 1))
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[(Math.random() * alphabet.length) | 0]
  return out
}

export function peerIdForRoom(code: string): string {
  return `kos-room-${code.trim().toUpperCase()}`
}

export type NetHitMsg = Extract<NetMsg, { t: 'hit' }>

/** Host-side shape/sanity checks before applying a remote hit (Phase 3 will deepen this). */
export function isValidNetHit(msg: unknown): msg is NetHitMsg {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  if (m.t !== 'hit') return false
  if (typeof m.targetId !== 'string' || !m.targetId) return false
  if (typeof m.attackerName !== 'string' || !m.attackerName) return false
  if (typeof m.weapon !== 'string' || !m.weapon) return false
  if (typeof m.headshot !== 'boolean') return false
  if (typeof m.damage !== 'number' || !Number.isFinite(m.damage)) return false
  if (m.damage <= 0 || m.damage > 500) return false
  return true
}

/** Clamp spoofable damage into a sane band until full server authority lands. */
export function sanitizeHitDamage(damage: number, headshot: boolean): number {
  const d = Math.max(1, Math.min(500, Math.floor(damage)))
  if (headshot) return Math.min(500, Math.max(d, 1))
  return d
}
