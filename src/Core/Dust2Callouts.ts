/**
 * Dust II callout zones in the scaled play space (normalizeToSize 350).
 * More specific volumes are listed first — first match wins.
 */

export type Dust2CalloutZone = {
  name: string
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const DUST2_CALLOUTS: ReadonlyArray<Dust2CalloutZone> = [
  { name: 'T Spawn', minX: -55, maxX: 10, minZ: 105, maxZ: 155 },
  { name: 'CT Spawn', minX: 22, maxX: 58, minZ: -100, maxZ: -65 },
  { name: 'A Site', minX: 70, maxX: 130, minZ: -120, maxZ: -45 },
  { name: 'Long Doors', minX: 85, maxX: 125, minZ: -40, maxZ: 25 },
  { name: 'Outside Long', minX: 70, maxX: 130, minZ: 25, maxZ: 110 },
  { name: 'Cat', minX: 40, maxX: 70, minZ: -55, maxZ: -30 },
  { name: 'Short', minX: 35, maxX: 75, minZ: -70, maxZ: -25 },
  { name: 'Mid Doors', minX: -15, maxX: 30, minZ: -35, maxZ: 15 },
  { name: 'Mid', minX: -35, maxX: 45, minZ: -55, maxZ: 55 },
  { name: 'Lower Tunnels', minX: -100, maxX: -45, minZ: -15, maxZ: 45 },
  { name: 'Upper Tunnels', minX: -90, maxX: -35, minZ: 40, maxZ: 100 },
  { name: 'B Site', minX: -140, maxX: -70, minZ: -130, maxZ: -25 },
  { name: 'B Doors', minX: -80, maxX: -40, minZ: -50, maxZ: 5 },
  { name: 'Xbox', minX: -10, maxX: 25, minZ: 15, maxZ: 50 },
]

/** Nearest authored callout for player/bot feet XZ, or null off-map. */
export function calloutAt(x: number, z: number): string | null {
  for (const zoned of DUST2_CALLOUTS) {
    if (x >= zoned.minX && x <= zoned.maxX && z >= zoned.minZ && z <= zoned.maxZ) {
      return zoned.name
    }
  }
  return null
}
