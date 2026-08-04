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
import type { Team } from './Teams'
import { otherTeam } from './Teams'

/** @deprecated Prefer MapCatalog — kept as pool_day alias for older imports */
export const MATCH_SPAWNS: ReadonlyArray<SpawnPoint> = getMapDefinition('pool_day').spawns

export { BOT_GROUND_Y, flatDistXZ, shuffleInPlace, spawnToBotVector, spawnToPlayerVector }
export type { MapId, SpawnPoint }

export function getSpawnsForMap(mapId: MapId, runtimeSpawns?: ReadonlyArray<SpawnPoint>): ReadonlyArray<SpawnPoint> {
  if (runtimeSpawns && runtimeSpawns.length > 0) return runtimeSpawns
  return getMapDefinition(mapId).spawns
}

export type SpawnAssignment = {
  playerPos: Vector3D
  botPositions: Vector3D[]
  botTeams: Array<Team | null>
}

/**
 * FFA / deathmatch: pick player + bots so each new seat maximizes distance to
 * already-taken pits. A plain shuffle often stacks several bots in one corner
 * of a large map (Dust II) even when plenty of far spawns exist.
 */
export function assignFfaSpawns(
  spawns: ReadonlyArray<SpawnPoint>,
  botCount: number
): SpawnAssignment {
  if (spawns.length === 0) {
    return {
      playerPos: new Vector3D(0, 2, 0),
      botPositions: [],
      botTeams: [],
    }
  }
  const order = shuffleInPlace([...spawns.keys()])
  const playerIdx = order[0] ?? 0
  const playerPos = spawnToPlayerVector(spawns[playerIdx] ?? { x: 0, y: 2, z: 0 })
  const used = new Set<number>([playerIdx])
  const botPositions: Vector3D[] = []
  const need = Math.min(botCount, Math.max(0, spawns.length - 1))
  while (botPositions.length < need) {
    let bestIdx = -1
    let bestScore = -1
    for (let i = 0; i < spawns.length; i++) {
      if (used.has(i)) continue
      const s = spawns[i]
      let nearest = Infinity
      for (const u of used) {
        const o = spawns[u]
        nearest = Math.min(nearest, flatDistXZ(s.x, s.z, o.x, o.z))
      }
      // Tiny jitter so ties don't always prefer the lowest index
      const score = nearest + Math.random() * 0.01
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx < 0) break
    used.add(bestIdx)
    botPositions.push(spawnToBotVector(spawns[bestIdx]))
  }
  return { playerPos, botPositions, botTeams: botPositions.map(() => null) }
}

export function assignTeamSpawnsPure(
  mine: SpawnPoint[],
  theirs: SpawnPoint[],
  playerTeam: Team,
  teamSize: number,
  botCount: number
): SpawnAssignment {
  const mySide = shuffleInPlace([...mine])
  const theirSide = shuffleInPlace([...theirs])
  const playerPos = spawnToPlayerVector(mySide.shift() ?? { x: 0, y: 2, z: 0 })
  const botPositions: Vector3D[] = []
  const botTeams: Array<Team | null> = []
  const friends = Math.min(teamSize - 1, mySide.length)
  const enemies = Math.min(botCount - friends, theirSide.length)
  for (let i = 0; i < friends; i++) {
    botPositions.push(spawnToBotVector(mySide[i]))
    botTeams.push(playerTeam)
  }
  for (let i = 0; i < enemies; i++) {
    botPositions.push(spawnToBotVector(theirSide[i]))
    botTeams.push(otherTeam(playerTeam))
  }
  return { playerPos, botPositions, botTeams }
}

export function pickRespawnFromList(
  spawnList: ReadonlyArray<SpawnPoint>,
  occupied: ReadonlyArray<{ x: number; z: number }>,
  preferAwayFrom: Vector3D | undefined,
  forBot: boolean,
  minClear = 8
): Vector3D {
  type Ranked = { idx: number; score: number }
  const ranked: Ranked[] = []
  for (let i = 0; i < spawnList.length; i++) {
    const s = spawnList[i]
    let nearest = Infinity
    for (const o of occupied) {
      nearest = Math.min(nearest, flatDistXZ(s.x, s.z, o.x, o.z))
    }
    let score = nearest
    if (preferAwayFrom) {
      score += flatDistXZ(s.x, s.z, preferAwayFrom.x, preferAwayFrom.z) * 0.15
    }
    ranked.push({ idx: i, score })
  }
  ranked.sort((a, b) => b.score - a.score)
  const clear = ranked.find((r) => {
    const s = spawnList[r.idx]
    return occupied.every((o) => flatDistXZ(s.x, s.z, o.x, o.z) >= minClear)
  })
  const pick = clear ?? ranked[0]
  const s = spawnList[pick?.idx ?? 0] ?? { x: 0, y: 2, z: 0 }
  return forBot ? spawnToBotVector(s) : spawnToPlayerVector(s)
}
