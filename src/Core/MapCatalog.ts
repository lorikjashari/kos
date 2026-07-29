import { Vector3D } from './Vector'

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
    defaultBotCount: 0,
    spawns: [{ x: 0, y: 2.0, z: 0 }],
  },
}

export const DEFAULT_MAP_ID: MapId = 'pool_day'

export function getMapDefinition(id: MapId): MapDefinition {
  return MAP_CATALOG[id] ?? MAP_CATALOG.pool_day
}

export function spawnToPlayerVector(s: SpawnPoint): Vector3D {
  return new Vector3D(s.x, s.y, s.z)
}

/** Bot root / feet height (player Y=2 is capsule mid, not feet) */
export const BOT_GROUND_Y = 0

export function spawnToBotVector(s: SpawnPoint): Vector3D {
  return new Vector3D(s.x, BOT_GROUND_Y, s.z)
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
