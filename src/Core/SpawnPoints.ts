import { Vector3D } from './Vector'
import {
  BOT_GROUND_Y,
  flatDistXZ,
  getMapDefinition,
  type MapId,
  type SpawnPoint,
  shuffleInPlace,
  spawnToBotVector,
  spawnToPlayerVector,
} from './MapCatalog'

/** @deprecated Prefer MapCatalog — kept as pool_day alias for older imports */
export const MATCH_SPAWNS: ReadonlyArray<SpawnPoint> = getMapDefinition('pool_day').spawns

export { BOT_GROUND_Y, flatDistXZ, shuffleInPlace, spawnToBotVector, spawnToPlayerVector }
export type { MapId, SpawnPoint }

export function getSpawnsForMap(mapId: MapId, runtimeSpawns?: ReadonlyArray<SpawnPoint>): ReadonlyArray<SpawnPoint> {
  if (runtimeSpawns && runtimeSpawns.length > 0) return runtimeSpawns
  return getMapDefinition(mapId).spawns
}
