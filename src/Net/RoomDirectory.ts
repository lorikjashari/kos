import mqtt, { type MqttClient } from 'mqtt'
import { MP_MAX_HUMANS } from './NetTypes'
import {
  parseRoomDirectoryPayload,
  ROOM_STALE_MS,
  type PublicRoomInfo,
} from './RoomSanitize'
import { loadNetConfig } from './NetConfig'

export type { PublicRoomInfo }

const NET = loadNetConfig()
const TOPIC = NET.mqttTopic
const BROKER = NET.mqttBroker
const STALE_MS = ROOM_STALE_MS
const MAX_PLAYERS = MP_MAX_HUMANS

/**
 * Free public room browser via MQTT (no paid server / API keys).
 * Hosts publish heartbeats; clients list fresh rooms and tap to join.
 */
export class RoomDirectory {
  private client: MqttClient | null = null
  private rooms = new Map<string, PublicRoomInfo>()
  private onChange: ((rooms: PublicRoomInfo[]) => void) | null = null
  private publishTimer: number | null = null
  private pruneTimer: number | null = null
  private hosting: PublicRoomInfo | null = null
  private connecting: Promise<void> | null = null

  public static readonly MAX_PLAYERS = MAX_PLAYERS

  public async ensureConnected(): Promise<void> {
    if (this.client?.connected) return
    if (this.connecting) return this.connecting
    this.connecting = new Promise((resolve, reject) => {
      try {
        const client = mqtt.connect(BROKER, {
          clientId: `kos_${Math.random().toString(36).slice(2, 10)}`,
          clean: true,
          reconnectPeriod: 2500,
          connectTimeout: 10000,
        })
        this.client = client
        const fail = (err: Error) => {
          this.connecting = null
          reject(err)
        }
        client.once('connect', () => {
          this.connecting = null
          client.subscribe(TOPIC, (err) => {
            if (err) console.warn('[rooms] subscribe', err)
          })
          if (!this.pruneTimer) {
            this.pruneTimer = window.setInterval(() => this.prune(), 2000)
          }
          resolve()
        })
        client.on('message', (_topic, payload) => this.onMessage(payload))
        client.on('error', (err) => console.warn('[rooms]', err.message))
        window.setTimeout(() => {
          if (!client.connected) fail(new Error('Room list timeout'))
        }, 12000)
      } catch (e) {
        this.connecting = null
        reject(e instanceof Error ? e : new Error('Room list failed'))
      }
    })
    return this.connecting
  }

  public watch(onChange: (rooms: PublicRoomInfo[]) => void): void {
    this.onChange = onChange
    void this.ensureConnected()
      .then(() => this.emit())
      .catch((e) => console.warn('[rooms]', e))
  }

  public unwatch(): void {
    this.onChange = null
  }

  public async startHosting(info: {
    code: string
    host: string
    players: number
    max?: number
    mapId?: 'pool_day' | 'de_dust2'
  }): Promise<void> {
    await this.ensureConnected()
    const host = (info.host || 'Player').trim().slice(0, 24) || 'Player'
    const mapId = info.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
    this.hosting = {
      code: info.code.toUpperCase(),
      name: `${host}'s Room`,
      host,
      players: Math.max(1, info.players),
      max: Math.max(2, Math.min(MAX_PLAYERS, info.max ?? MAX_PLAYERS)),
      ts: Date.now(),
      mapId,
    }
    this.publishNow()
    if (this.publishTimer) window.clearInterval(this.publishTimer)
    this.publishTimer = window.setInterval(() => this.publishNow(), 3000)
  }

  public updateHosting(players: number): void {
    if (!this.hosting) return
    this.hosting.players = Math.max(1, players)
    this.hosting.ts = Date.now()
    this.publishNow()
  }

  public stopHosting(): void {
    if (this.publishTimer) {
      window.clearInterval(this.publishTimer)
      this.publishTimer = null
    }
    const code = this.hosting?.code
    this.hosting = null
    if (code && this.client?.connected) {
      try {
        this.client.publish(
          TOPIC,
          JSON.stringify({ op: 'close', code }),
          { qos: 0 }
        )
      } catch {
        /* ignore */
      }
    }
  }

  public destroy(): void {
    this.stopHosting()
    this.unwatch()
    if (this.pruneTimer) {
      window.clearInterval(this.pruneTimer)
      this.pruneTimer = null
    }
    try {
      this.client?.end(true)
    } catch {
      /* ignore */
    }
    this.client = null
    this.rooms.clear()
  }

  private publishNow(): void {
    if (!this.hosting || !this.client?.connected) return
    this.hosting.ts = Date.now()
    try {
      this.client.publish(TOPIC, JSON.stringify({ op: 'up', room: this.hosting }), { qos: 0 })
    } catch {
      /* ignore */
    }
  }

  private onMessage(payload: Uint8Array | Buffer): void {
    try {
      const data = JSON.parse(payload.toString())
      const parsed = parseRoomDirectoryPayload(data)
      if (!parsed) return
      if (parsed.op === 'close') {
        this.rooms.delete(parsed.code)
        this.emit()
        return
      }
      this.rooms.set(parsed.room.code, parsed.room)
      this.emit()
    } catch {
      /* ignore bad payloads */
    }
  }

  private prune(): void {
    const now = Date.now()
    let changed = false
    for (const [code, room] of this.rooms) {
      if (now - room.ts > STALE_MS) {
        this.rooms.delete(code)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  private emit(): void {
    if (!this.onChange) return
    const list = [...this.rooms.values()].sort((a, b) => b.ts - a.ts)
    this.onChange(list)
  }
}

export const roomDirectory = new RoomDirectory()
