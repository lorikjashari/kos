import { MP_MAX_HUMANS, peerIdForRoom } from './NetTypes'

const CODE_RE = /^[A-Z0-9]{4,8}$/
const STALE_MS_DEFAULT = 10000

export const ROOM_STALE_MS = STALE_MS_DEFAULT

export type PublicRoomInfo = {
  code: string
  name: string
  host: string
  players: number
  max: number
  ts: number
  mapId?: 'pool_day' | 'de_dust2'
}

export type RoomDirectoryMsg =
  | { op: 'close'; code: string }
  | { op: 'up'; room: PublicRoomInfo }
  | null

/** Reject garbage MQTT payloads; clamp players/max; whitelist map. */
export function parseRoomDirectoryPayload(raw: unknown, now = Date.now()): RoomDirectoryMsg {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>

  if (data.op === 'close') {
    if (typeof data.code !== 'string') return null
    const code = data.code.trim().toUpperCase()
    if (!CODE_RE.test(code)) return null
    return { op: 'close', code }
  }

  if (data.op !== 'up' && data.op !== undefined && data.room) {
    // tolerate missing op when room blob present (legacy)
  } else if (data.op !== 'up' && data.op !== undefined) {
    return null
  }

  const room = data.room as Record<string, unknown> | undefined
  if (!room || typeof room !== 'object') return null
  if (typeof room.code !== 'string' || typeof room.name !== 'string') return null

  const code = room.code.trim().toUpperCase()
  if (!CODE_RE.test(code)) return null
  // Peer id alphabet must stay compatible
  if (!peerIdForRoom(code).startsWith('kos-room-')) return null

  const host = String(room.host ?? 'Host')
    .trim()
    .slice(0, 24)
    .replace(/[<>]/g, '')
  const name = String(room.name)
    .trim()
    .slice(0, 40)
    .replace(/[<>]/g, '')
  if (!host || !name) return null

  let players = Math.floor(Number(room.players))
  if (!Number.isFinite(players)) return null
  players = Math.max(1, Math.min(MP_MAX_HUMANS, players))

  let max = Math.floor(Number(room.max))
  if (!Number.isFinite(max)) max = MP_MAX_HUMANS
  max = Math.max(2, Math.min(MP_MAX_HUMANS, max))
  if (players > max) players = max

  let ts = Number(room.ts)
  if (!Number.isFinite(ts)) ts = now
  // Future timestamps / ancient spam
  if (ts > now + 5000) ts = now
  if (now - ts > ROOM_STALE_MS * 3) return null

  const mapId = room.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'

  return {
    op: 'up',
    room: { code, name, host, players, max, ts, mapId },
  }
}
