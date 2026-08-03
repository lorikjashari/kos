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

export const MP_FILL_BOTS = 10
export const MP_MAX_HUMANS = 15
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
