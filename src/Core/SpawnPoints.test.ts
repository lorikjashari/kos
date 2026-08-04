import { describe, expect, it } from 'vitest'
import { assignFfaSpawns, assignTeamSpawnsPure, pickRespawnFromList } from './SpawnPoints'
import { Vector3D } from './Vector'

const ring = [
  { x: 0, y: 2, z: 0 },
  { x: 10, y: 2, z: 0 },
  { x: 20, y: 2, z: 0 },
  { x: 30, y: 2, z: 0 },
]

describe('assignFfaSpawns', () => {
  it('never puts bots on the player spawn index count', () => {
    const a = assignFfaSpawns(ring, 3)
    expect(a.botPositions).toHaveLength(3)
    expect(a.botTeams.every((t) => t === null)).toBe(true)
  })

  it('spreads bots across the map instead of stacking neighbours', () => {
    // Two tight clusters far apart — greedy maximin should take from both
    const clustered = [
      { x: 0, y: 2, z: 0 },
      { x: 2, y: 2, z: 0 },
      { x: 4, y: 2, z: 0 },
      { x: 100, y: 2, z: 0 },
      { x: 102, y: 2, z: 0 },
      { x: 104, y: 2, z: 0 },
    ]
    const a = assignFfaSpawns(clustered, 2)
    const xs = [a.playerPos.x, ...a.botPositions.map((p) => p.x)]
    const inLow = xs.filter((x) => x <= 4).length
    const inHigh = xs.filter((x) => x >= 100).length
    expect(inLow).toBeGreaterThan(0)
    expect(inHigh).toBeGreaterThan(0)
    // First bot after the player should not sit on a neighbour (~2u) pit
    const d0 = Math.hypot(a.botPositions[0].x - a.playerPos.x, a.botPositions[0].z - a.playerPos.z)
    expect(d0).toBeGreaterThan(50)
  })
})

describe('assignTeamSpawnsPure', () => {
  it('fills friends then enemies', () => {
    const a = assignTeamSpawnsPure(ring, ring, 'CT', 3, 5)
    const friends = a.botTeams.filter((t) => t === 'CT').length
    const enemies = a.botTeams.filter((t) => t === 'T').length
    expect(friends).toBe(2)
    expect(enemies).toBe(3)
  })
})

describe('pickRespawnFromList', () => {
  it('avoids occupied points when possible', () => {
    const pos = pickRespawnFromList(
      ring,
      [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 20, z: 0 },
      ],
      new Vector3D(0, 0, 0),
      false,
      8
    )
    expect(pos.x).toBe(30)
  })
})
