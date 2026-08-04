import { Vector3D } from './Vector'
import type { Team } from './Teams'

export type MapId = 'pool_day' | 'de_dust2'

export type SpawnPoint = { x: number; y: number; z: number }

export type MapDefinition = {
  id: MapId
  name: string
  /** Path under Vite public/ */
  glbPath: string
  /** Registry key in GlobalLoadingManager.loadableMeshs */
  meshKey: string
  /** Pool-day corridor / spot light fillers */
  usePoolLights: boolean
  /** Debug prop cubes near pool */
  useDebugCubes: boolean
  /**
   * If horizontal size is larger than this, normalize map scale to fit.
   * CS maps are often authored in huge units.
   */
  normalizeToSize?: number
  /** Multiplies player wish-speed on this map (Dust II is large) */
  moveSpeedScale?: number
  /** Fixed spawns (player Y ≈ capsule center). Empty = derive after load. */
  spawns: ReadonlyArray<SpawnPoint>
  /** Default bots when this map is selected in the menu */
  defaultBotCount: number
  /** Per-side spawn sets. Present = this map can run team deathmatch. */
  teamSpawns?: Record<Team, ReadonlyArray<SpawnPoint>>
}

export const MAP_CATALOG: Record<MapId, MapDefinition> = {
  pool_day: {
    id: 'pool_day',
    name: 'Pool Day',
    glbPath: 'pool_day_baked.glb',
    meshKey: 'Map_pool_day',
    usePoolLights: true,
    useDebugCubes: true,
    defaultBotCount: 5,
    spawns: [
      { x: 18.9, y: 2.0, z: 29.7 },
      { x: 11.7, y: 2.0, z: 50.3 },
      { x: -3.6, y: 2.0, z: 29.9 },
      { x: -44.0, y: 2.0, z: 48.6 },
      { x: -37.7, y: 2.0, z: -3.2 },
      { x: -47.0, y: 2.0, z: -12.0 },
      { x: -34.4, y: 2.0, z: -41.8 },
      { x: -3.1, y: 2.0, z: -44.8 },
      { x: 13.9, y: 2.0, z: -35.8 },
      { x: 39.6, y: 2.0, z: -20.8 },
      { x: 57.0, y: 2.0, z: 13.2 },
      { x: 7.3, y: 2.0, z: 12.9 },
    ],
  },
  de_dust2: {
    id: 'de_dust2',
    name: 'Dust II',
    glbPath: 'maps/de_dust2.glb',
    meshKey: 'Map_de_dust2',
    usePoolLights: false,
    useDebugCubes: false,
    // Sketchfab dust2 is a miniature (~70u, ~8u tall). Player capsule is ~4u tall —
    // scale so doorways are walkable vs the character (was 160 = still dollhouse).
    normalizeToSize: 350,
    // Big map — slightly faster than pool, but not sprinty
    moveSpeedScale: 1.5,
    // Authored only — players/bots never use derived or fallback spawns on this map
    defaultBotCount: 5,
    spawns: [
      { x: 97.7, y: 21.0, z: -87.8 },
      { x: 53.8, y: 21.0, z: -54.9 },
      { x: 3.2, y: 6.2, z: -24.2 },
      { x: -89.6, y: 16.8, z: -18.0 },
      { x: -115.0, y: 16.8, z: -111.8 },
      { x: 26.3, y: 6.2, z: -91.8 },
      { x: -27.3, y: 14.7, z: 41.3 },
      { x: 55.8, y: 14.7, z: 51.1 },
      { x: 40.9, y: 14.7, z: 128.2 },
      { x: -52.7, y: 23.1, z: 101.4 },
      { x: 113.4, y: 2.0, z: 62.1 },
      { x: -11.7, y: 14.7, z: 112.9 },
      // Extra FFA pits so respawns don't stack on the same three mid spots
      { x: 88.0, y: 14.0, z: 20.0 },
      { x: -70.0, y: 14.0, z: -55.0 },
      { x: 18.0, y: 8.0, z: -55.0 },
    ],
    // Team deathmatch uses the real CS spawn pits instead of the free-for-all ring
    teamSpawns: {
      T: [
        { x: -28.4, y: 23.1, z: 119.9 },
        { x: -20.7, y: 23.1, z: 119.3 },
        { x: -15.2, y: 23.1, z: 122.0 },
        { x: -20.5, y: 23.3, z: 133.6 },
        { x: -27.7, y: 23.1, z: 129.3 },
        { x: -34.1, y: 23.5, z: 134.2 },
        { x: -35.4, y: 24.7, z: 139.2 },
        { x: -25.6, y: 24.8, z: 139.5 },
        { x: -8.4, y: 22.1, z: 131.4 },
        { x: -4.5, y: 21.7, z: 120.5 },
      ],
      CT: [
        { x: 48.0, y: 6.2, z: -76.0 },
        { x: 38.3, y: 6.2, z: -79.4 },
        { x: 32.4, y: 6.2, z: -72.1 },
        { x: 28.5, y: 6.2, z: -76.5 },
        { x: 35.6, y: 6.2, z: -83.8 },
        { x: 44.2, y: 6.2, z: -83.6 },
        { x: 52.0, y: 6.2, z: -86.0 },
        { x: 45.1, y: 6.2, z: -90.0 },
        { x: 38.4, y: 6.2, z: -88.7 },
        { x: 29.9, y: 6.2, z: -88.2 },
      ],
    },
  },
}

export function mapSupportsTeams(id: MapId): boolean {
  const def = getMapDefinition(id)
  return !!def.teamSpawns && def.teamSpawns.T.length > 0 && def.teamSpawns.CT.length > 0
}

export const DEFAULT_MAP_ID: MapId = 'pool_day'

export function getMapDefinition(id: MapId): MapDefinition {
  return MAP_CATALOG[id] ?? MAP_CATALOG.pool_day
}

export function spawnToPlayerVector(s: SpawnPoint): Vector3D {
  return new Vector3D(s.x, s.y, s.z)
}

/** Default bot feet Y on flat maps where player capsule centre is ~2 */
export const BOT_GROUND_Y = 0

/** Bot root / feet height — player spawn Y is capsule mid, not feet */
export function spawnToBotVector(s: SpawnPoint): Vector3D {
  return new Vector3D(s.x, s.y - PLAYER_CENTER_OFFSET, s.z)
}

export function flatDistXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx
  const dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type ProbeHit = {
  hasHit: boolean
  point?: { x: number; y: number; z: number }
  normal?: { x: number; y: number; z: number }
}

export type ProbeFn = (
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number }
) => ProbeHit

/** Roughly the player capsule: 4 units tall, centre at y+2 above the feet. */
export const PLAYER_HEIGHT = 4
export const PLAYER_CENTER_OFFSET = 2

/**
 * Find real standing room by probing the loaded collision mesh instead of
 * guessing from the bounding box. A box-derived ring drops players inside walls
 * or off the playable area, which is why maps without authored spawns had to run
 * with zero bots.
 *
 * Samples a grid from above, keeps points with flat ground and enough headroom
 * for the capsule, then greedily spreads the picks out so nobody spawns on top
 * of anyone else.
 */
export function deriveSpawnsFromGeometry(
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  probe: ProbeFn,
  wanted = 12
): SpawnPoint[] {
  const spanX = max.x - min.x
  const spanZ = max.z - min.z
  if (spanX <= 0 || spanZ <= 0) return []

  // Stay off the outer shell — that is usually skybox wall, not floor
  const inset = 0.08
  const steps = 42
  const top = max.y + 10
  const bottom = min.y - 10

  type Cand = { x: number; y: number; z: number }
  const candidates: Cand[] = []

  for (let ix = 0; ix <= steps; ix++) {
    for (let iz = 0; iz <= steps; iz++) {
      const x = min.x + spanX * (inset + (1 - 2 * inset) * (ix / steps))
      const z = min.z + spanZ * (inset + (1 - 2 * inset) * (iz / steps))

      const ground = probe({ x, y: top, z }, { x, y: bottom, z })
      if (!ground.hasHit || !ground.point) continue

      // Reject walls, ramps too steep to stand on, and ceilings hit from above
      const ny = ground.normal?.y ?? 1
      if (ny < 0.7) continue

      const feet = ground.point.y
      const head = probe(
        { x, y: feet + 0.6, z },
        { x, y: feet + PLAYER_HEIGHT, z }
      )
      if (head.hasHit) continue

      candidates.push({ x, y: feet, z })
    }
  }

  if (candidates.length === 0) return []

  // Rooftops and catwalks also pass the headroom test, so keep the height band
  // most of the map sits in and drop the outliers.
  const bucket = 3
  const histogram = new Map<number, number>()
  for (const c of candidates) {
    const key = Math.round(c.y / bucket)
    histogram.set(key, (histogram.get(key) ?? 0) + 1)
  }
  let dominant = 0
  let dominantCount = -1
  for (const [key, count] of histogram) {
    if (count > dominantCount) {
      dominantCount = count
      dominant = key
    }
  }
  const floorY = dominant * bucket
  const onFloor = candidates.filter((c) => Math.abs(c.y - floorY) <= bucket * 2)
  const pool = onFloor.length >= wanted ? onFloor : candidates

  const minSep = Math.max(10, Math.min(spanX, spanZ) * 0.14)
  const picked: SpawnPoint[] = []
  for (const c of shuffleInPlace([...pool])) {
    if (picked.every((p) => flatDistXZ(p.x, p.z, c.x, c.z) >= minSep)) {
      picked.push({ x: c.x, y: c.y + PLAYER_CENTER_OFFSET, z: c.z })
      if (picked.length >= wanted) break
    }
  }

  // A cramped map may not fit `wanted` well-separated points; take what we can
  if (picked.length < 4) {
    for (const c of pool) {
      if (picked.every((p) => flatDistXZ(p.x, p.z, c.x, c.z) >= minSep * 0.5)) {
        picked.push({ x: c.x, y: c.y + PLAYER_CENTER_OFFSET, z: c.z })
        if (picked.length >= wanted) break
      }
    }
  }
  return picked
}

/** Build a small spawn ring from a world-space AABB (after normalize). */
export function spawnsFromBounds(
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  playerYOffset = 2
): SpawnPoint[] {
  const cx = (min.x + max.x) * 0.5
  const cz = (min.z + max.z) * 0.5
  const y = min.y + playerYOffset
  const rx = Math.max(8, (max.x - min.x) * 0.22)
  const rz = Math.max(8, (max.z - min.z) * 0.22)
  return [
    { x: cx, y, z: cz },
    { x: cx + rx, y, z: cz },
    { x: cx - rx, y, z: cz },
    { x: cx, y, z: cz + rz },
    { x: cx, y, z: cz - rz },
    { x: cx + rx * 0.7, y, z: cz + rz * 0.7 },
    { x: cx - rx * 0.7, y, z: cz - rz * 0.7 },
  ]
}
