import type { PeerJSOption } from 'peerjs'

/** Default public brokers — used when no VITE_* overrides are set. */
export const DEFAULT_MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt'
export const DEFAULT_MQTT_TOPIC = 'kos/fps/rooms/v1'

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export type KosNetConfig = {
  /** PeerJS cloud/key, or custom PeerServer host fields. */
  peer: PeerJSOption
  mqttBroker: string
  mqttTopic: string
  /** True when any VITE override was applied. */
  customized: boolean
}

function env(name: string): string | undefined {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[name]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  } catch {
    return undefined
  }
}

/** Parse `VITE_ICE_SERVERS` JSON; fall back to defaults on bad input. */
export function parseIceServers(raw: string | undefined): RTCIceServer[] {
  if (!raw) return DEFAULT_ICE_SERVERS
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ICE_SERVERS
    const out: RTCIceServer[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      if (typeof e.urls !== 'string' && !Array.isArray(e.urls)) continue
      const server: RTCIceServer = {
        urls: e.urls as string | string[],
      }
      if (typeof e.username === 'string') server.username = e.username
      if (typeof e.credential === 'string') server.credential = e.credential
      out.push(server)
    }
    return out.length ? out : DEFAULT_ICE_SERVERS
  } catch {
    return DEFAULT_ICE_SERVERS
  }
}

/**
 * Build PeerJS + MQTT options from Vite env.
 *
 * | Variable | Purpose |
 * |----------|---------|
 * | `VITE_PEER_HOST` | Custom PeerServer host (omit for PeerJS cloud) |
 * | `VITE_PEER_PORT` | PeerServer port |
 * | `VITE_PEER_PATH` | PeerServer path (default `/`) |
 * | `VITE_PEER_KEY` | PeerJS API key |
 * | `VITE_PEER_SECURE` | `true`/`false` for wss/ws |
 * | `VITE_ICE_SERVERS` | JSON array of RTCIceServer |
 * | `VITE_MQTT_BROKER` | Room-list WebSocket URL |
 * | `VITE_MQTT_TOPIC` | Room-list MQTT topic |
 */
export function loadNetConfig(): KosNetConfig {
  const host = env('VITE_PEER_HOST')
  const portRaw = env('VITE_PEER_PORT')
  const path = env('VITE_PEER_PATH')
  const key = env('VITE_PEER_KEY')
  const secureRaw = env('VITE_PEER_SECURE')
  const iceRaw = env('VITE_ICE_SERVERS')
  const mqttBroker = env('VITE_MQTT_BROKER') ?? DEFAULT_MQTT_BROKER
  const mqttTopic = env('VITE_MQTT_TOPIC') ?? DEFAULT_MQTT_TOPIC

  const iceServers = parseIceServers(iceRaw)
  const peer: PeerJSOption = {
    debug: 0,
    config: { iceServers },
  }

  let customized = !!(host || portRaw || path || key || secureRaw || iceRaw || env('VITE_MQTT_BROKER') || env('VITE_MQTT_TOPIC'))

  if (key) peer.key = key
  if (host) {
    peer.host = host
    if (portRaw) {
      const port = Number(portRaw)
      if (Number.isFinite(port)) peer.port = port
    }
    peer.path = path || '/'
    if (secureRaw !== undefined) {
      peer.secure = secureRaw === '1' || secureRaw.toLowerCase() === 'true'
    }
  }

  return { peer, mqttBroker, mqttTopic, customized }
}
