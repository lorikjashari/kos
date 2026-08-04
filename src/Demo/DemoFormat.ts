/** Local POV demo format (not Valve .dem). Versioned JSON. */

export const DEMO_VERSION = 1 as const
export const DEMO_TICK_HZ = 20
export const DEMO_STORAGE_KEY = 'kos-demo-last-v1'

export type DemoHeader = {
  version: typeof DEMO_VERSION
  mapId: string
  teamMode: string
  tickHz: number
  recordedAt: string
  playerName: string
  duration: number
}

/** Compact sample — player pose only (bots stay live/frozen separately). */
export type DemoTick = {
  /** Seconds from record start */
  t: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  hp: number
}

export type DemoFile = {
  header: DemoHeader
  ticks: DemoTick[]
}

export function isDemoFile(v: unknown): v is DemoFile {
  if (!v || typeof v !== 'object') return false
  const d = v as DemoFile
  return (
    !!d.header &&
    d.header.version === DEMO_VERSION &&
    typeof d.header.mapId === 'string' &&
    Array.isArray(d.ticks)
  )
}

export function serializeDemo(demo: DemoFile): string {
  return JSON.stringify(demo)
}

export function parseDemoJson(raw: string): DemoFile | null {
  try {
    const v = JSON.parse(raw) as unknown
    return isDemoFile(v) ? v : null
  } catch {
    return null
  }
}

/** Linear interpolate between two ticks for smooth playback. */
export function sampleDemoAt(demo: DemoFile, time: number): DemoTick | null {
  const ticks = demo.ticks
  if (!ticks.length) return null
  if (time <= ticks[0].t) return { ...ticks[0] }
  const last = ticks[ticks.length - 1]
  if (time >= last.t) return { ...last }

  let lo = 0
  let hi = ticks.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (ticks[mid].t <= time) lo = mid
    else hi = mid
  }
  const a = ticks[lo]
  const b = ticks[hi]
  const span = b.t - a.t
  const u = span > 1e-6 ? (time - a.t) / span : 0
  return {
    t: time,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    yaw: lerpAngle(a.yaw, b.yaw, u),
    pitch: a.pitch + (b.pitch - a.pitch) * u,
    hp: Math.round(a.hp + (b.hp - a.hp) * u),
  }
}

function lerpAngle(a: number, b: number, u: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * u
}
