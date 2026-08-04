import type { Team } from './Teams'
import { Vector3D } from './Vector'

/**
 * CS-style Dust II defaults for TDM bots.
 * Anchors are inferred from authored T/CT pits + FFA spawns in our scaled world
 * (normalizeToSize 350). Tunable in-game.
 */

export type Dust2Role =
  | 't_long'
  | 't_b'
  | 't_mid_short'
  | 't_mid_lower'
  | 't_mid_peek'
  | 'ct_a'
  | 'ct_b'
  | 'ct_mid'
  | 'ct_a_depth'
  | 'ct_b_depth'
  | 'ct_cat'

export type Dust2Site = 'A' | 'B' | 'MID'

export type TacticPoint = { x: number; y: number; z: number }

export type TacticRoute = {
  role: Dust2Role
  team: Team
  label: string
  /** Primary hold/site this role covers */
  site: Dust2Site
  /** Waypoints from T/CT spawn toward the job */
  path: ReadonlyArray<TacticPoint>
  holdRadius: number
}

const T_ROLES: Dust2Role[] = ['t_long', 't_b', 't_mid_short', 't_mid_lower', 't_mid_peek']
const CT_ROLES: Dust2Role[] = ['ct_a', 'ct_b', 'ct_mid', 'ct_a_depth', 'ct_b_depth', 'ct_cat']

/** Routes use feet-ish Y; TrainingBot.followTerrain snaps to ground. */
export const DUST2_ROUTES: Record<Dust2Role, TacticRoute> = {
  // T: Outside Long → Long Doors → A
  t_long: {
    role: 't_long',
    team: 'T',
    label: 'Long A',
    site: 'A',
    holdRadius: 12,
    path: [
      { x: 55, y: 14, z: 100 },
      { x: 95, y: 12, z: 60 },
      { x: 100, y: 12, z: 10 },
      { x: 96, y: 14, z: -40 },
      { x: 90, y: 16, z: -75 },
    ],
  },
  t_b: {
    role: 't_b',
    team: 'T',
    label: 'B Tunnels',
    site: 'B',
    holdRadius: 12,
    path: [
      { x: -35, y: 18, z: 108 },
      { x: -65, y: 16, z: 72 },
      { x: -85, y: 14, z: 28 },
      { x: -96, y: 14, z: -20 },
      { x: -102, y: 14, z: -68 },
    ],
  },
  t_mid_short: {
    role: 't_mid_short',
    team: 'T',
    label: 'Mid → Short',
    site: 'A',
    holdRadius: 11,
    path: [
      { x: -15, y: 14, z: 72 },
      { x: -2, y: 10, z: 28 },
      { x: 14, y: 8, z: -12 },
      { x: 38, y: 10, z: -38 },
      { x: 52, y: 12, z: -50 },
    ],
  },
  t_mid_lower: {
    role: 't_mid_lower',
    team: 'T',
    label: 'Mid → Lower',
    site: 'B',
    holdRadius: 11,
    path: [
      { x: -16, y: 14, z: 66 },
      { x: -38, y: 12, z: 32 },
      { x: -62, y: 12, z: 8 },
      { x: -86, y: 14, z: -18 },
    ],
  },
  t_mid_peek: {
    role: 't_mid_peek',
    team: 'T',
    label: 'Mid Peek',
    site: 'MID',
    holdRadius: 10,
    path: [
      { x: -10, y: 14, z: 72 },
      { x: 2, y: 10, z: 22 },
      { x: 10, y: 8, z: -12 },
      { x: 20, y: 8, z: -36 },
    ],
  },
  ct_a: {
    role: 'ct_a',
    team: 'CT',
    label: 'A Site',
    site: 'A',
    holdRadius: 14,
    path: [
      { x: 42, y: 6, z: -78 },
      { x: 68, y: 10, z: -80 },
      { x: 90, y: 14, z: -78 },
    ],
  },
  ct_b: {
    role: 'ct_b',
    team: 'CT',
    label: 'B Site',
    site: 'B',
    holdRadius: 14,
    path: [
      { x: 18, y: 6, z: -58 },
      { x: -12, y: 8, z: -34 },
      { x: -52, y: 12, z: -34 },
      { x: -92, y: 14, z: -68 },
    ],
  },
  ct_mid: {
    role: 'ct_mid',
    team: 'CT',
    label: 'Mid',
    site: 'MID',
    holdRadius: 12,
    path: [
      { x: 28, y: 6, z: -72 },
      { x: 10, y: 8, z: -38 },
      { x: 4, y: 8, z: -16 },
    ],
  },
  ct_a_depth: {
    role: 'ct_a_depth',
    team: 'CT',
    label: 'A Long',
    site: 'A',
    holdRadius: 11,
    path: [
      { x: 50, y: 8, z: -72 },
      { x: 72, y: 12, z: -58 },
      { x: 96, y: 14, z: -48 },
    ],
  },
  ct_b_depth: {
    role: 'ct_b_depth',
    team: 'CT',
    label: 'B Depth',
    site: 'B',
    holdRadius: 11,
    path: [
      { x: 5, y: 8, z: -45 },
      { x: -42, y: 12, z: -38 },
      { x: -90, y: 14, z: -42 },
    ],
  },
  ct_cat: {
    role: 'ct_cat',
    team: 'CT',
    label: 'Cat',
    site: 'A',
    holdRadius: 10,
    path: [
      { x: 32, y: 6, z: -65 },
      { x: 44, y: 10, z: -48 },
      { x: 54, y: 12, z: -40 },
    ],
  },
}

/** Rough site volumes for pressure / occupancy (XZ). */
export const DUST2_SITES: Record<
  Dust2Site,
  { minX: number; maxX: number; minZ: number; maxZ: number }
> = {
  A: { minX: 55, maxX: 130, minZ: -120, maxZ: -35 },
  B: { minX: -140, maxX: -55, minZ: -130, maxZ: 30 },
  MID: { minX: -40, maxX: 55, minZ: -70, maxZ: 70 },
}

export function pointInDust2Site(x: number, z: number, site: Dust2Site): boolean {
  const b = DUST2_SITES[site]
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

/** Fill T/CT bot role lists by count — spreads defaults like a real lineup. */
export function assignDust2Roles(tBotCount: number, ctBotCount: number): {
  T: Dust2Role[]
  CT: Dust2Role[]
} {
  const T: Dust2Role[] = []
  const CT: Dust2Role[] = []
  for (let i = 0; i < tBotCount; i++) T.push(T_ROLES[i % T_ROLES.length])
  for (let i = 0; i < ctBotCount; i++) CT.push(CT_ROLES[i % CT_ROLES.length])
  return { T, CT }
}

/** Map pending bot team slots → roles (null when not Dust II TDM). */
export function planDust2RolesForTeams(
  botTeams: ReadonlyArray<Team | null>,
  enabled: boolean
): Array<Dust2Role | null> {
  if (!enabled) return botTeams.map(() => null)
  let tCount = 0
  let ctCount = 0
  for (const t of botTeams) {
    if (t === 'T') tCount++
    else if (t === 'CT') ctCount++
  }
  const planned = assignDust2Roles(tCount, ctCount)
  let ti = 0
  let ci = 0
  return botTeams.map((team) => {
    if (team === 'T') return planned.T[ti++] ?? 't_mid_peek'
    if (team === 'CT') return planned.CT[ci++] ?? 'ct_mid'
    return null
  })
}

/** Pick the least-used role on a side (mid-match fills). */
export function nextDust2RoleForTeam(
  team: Team,
  used: ReadonlyArray<Dust2Role | null | undefined>
): Dust2Role {
  const pool = team === 'T' ? T_ROLES : CT_ROLES
  const counts = new Map<Dust2Role, number>()
  for (const r of pool) counts.set(r, 0)
  for (const r of used) {
    if (!r || !counts.has(r)) continue
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  let best = pool[0]
  let bestN = Infinity
  for (const r of pool) {
    const n = counts.get(r) ?? 0
    if (n < bestN) {
      bestN = n
      best = r
    }
  }
  return best
}

export function routeForRole(role: Dust2Role): TacticRoute {
  return DUST2_ROUTES[role]
}

export function pathToVectors(path: ReadonlyArray<TacticPoint>): Vector3D[] {
  return path.map((p) => new Vector3D(p.x, p.y, p.z))
}

/** Prefer rotating mid/cat holders before stripping the opposite site. */
export function ctRolesForRotate(toSite: Dust2Site): Dust2Role[] {
  if (toSite === 'A') return ['ct_mid', 'ct_cat', 'ct_b_depth', 'ct_b']
  if (toSite === 'B') return ['ct_mid', 'ct_cat', 'ct_a_depth', 'ct_a']
  return ['ct_a_depth', 'ct_b_depth', 'ct_cat']
}
