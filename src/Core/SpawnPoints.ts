import { Vector3D } from './Vector'

/** Shared spawn points for player + bots (fy_pool_day).
 *  Y in this list is the *player capsule center* (~2).
 *  Bot meshes sit on the floor — use BOT_GROUND_Y for them.
 */
export const MATCH_SPAWNS: ReadonlyArray<{ x: number; y: number; z: number }> = [
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
]

/** Bot root / feet height (player Y=2 is capsule mid, not feet) */
export const BOT_GROUND_Y = 0

export function spawnToPlayerVector(s: { x: number; y: number; z: number }): Vector3D {
  return new Vector3D(s.x, s.y, s.z)
}

export function spawnToBotVector(s: { x: number; y: number; z: number }): Vector3D {
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
