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
    holdRadius: 14,
    path: [
      { x: 70, y: 12, z: 95 },
      { x: 105, y: 10, z: 55 },
      { x: 102, y: 12, z: 5 },
      { x: 98, y: 14, z: -45 },
      { x: 92, y: 16, z: -78 },
    ],
  },
  t_b: {
    role: 't_b',
    team: 'T',
    label: 'B Tunnels',
    site: 'B',
    holdRadius: 14,
    path: [
      { x: -40, y: 18, z: 110 },
      { x: -70, y: 16, z: 70 },
      { x: -90, y: 14, z: 20 },
      { x: -100, y: 14, z: -25 },
      { x: -105, y: 14, z: -70 },
    ],
  },
  t_mid_short: {
    role: 't_mid_short',
    team: 'T',
    label: 'Mid → Short',
    site: 'A',
    holdRadius: 12,
    path: [
      { x: -18, y: 14, z: 70 },
      { x: -5, y: 10, z: 25 },
      { x: 12, y: 8, z: -15 },
      { x: 40, y: 10, z: -40 },
      { x: 55, y: 12, z: -52 },
    ],
  },
  t_mid_lower: {
    role: 't_mid_lower',
    team: 'T',
    label: 'Mid → Lower',
    site: 'B',
    holdRadius: 12,
    path: [
      { x: -18, y: 14, z: 65 },
      { x: -40, y: 12, z: 30 },
      { x: -65, y: 12, z: 5 },
      { x: -88, y: 14, z: -20 },
    ],
  },
  t_mid_peek: {
    role: 't_mid_peek',
    team: 'T',
    label: 'Mid Peek',
    site: 'MID',
    holdRadius: 11,
    path: [
      { x: -12, y: 14, z: 75 },
      { x: 0, y: 10, z: 20 },
      { x: 12, y: 8, z: -15 },
      { x: 24, y: 8, z: -40 },
    ],
  },
  ct_a: {
    role: 'ct_a',
    team: 'CT',
    label: 'A Site',
    site: 'A',
    holdRadius: 16,
    path: [
      { x: 42, y: 6, z: -78 },
      { x: 70, y: 10, z: -82 },
      { x: 92, y: 14, z: -80 },
    ],
  },
  ct_b: {
    role: 'ct_b',
    team: 'CT',
    label: 'B Site',
    site: 'B',
    holdRadius: 16,
    path: [
      { x: 20, y: 6, z: -60 },
      { x: -10, y: 8, z: -35 },
      { x: -55, y: 12, z: -35 },
      { x: -95, y: 14, z: -70 },
    ],
  },
  ct_mid: {
    role: 'ct_mid',
    team: 'CT',
    label: 'Mid',
    site: 'MID',
    holdRadius: 14,
    path: [
      { x: 28, y: 6, z: -72 },
      { x: 12, y: 8, z: -40 },
      { x: 6, y: 8, z: -18 },
    ],
  },
  ct_a_depth: {
    role: 'ct_a_depth',
    team: 'CT',
    label: 'A Long',
    site: 'A',
    holdRadius: 12,
    path: [
      { x: 50, y: 8, z: -72 },
      { x: 75, y: 12, z: -60 },
      { x: 98, y: 14, z: -50 },
    ],
  },
  ct_b_depth: {
    role: 'ct_b_depth',
    team: 'CT',
    label: 'B Depth',
    site: 'B',
    holdRadius: 12,
    path: [
      { x: 5, y: 8, z: -45 },
      { x: -45, y: 12, z: -40 },
      { x: -92, y: 14, z: -45 },
    ],
  },
  ct_cat: {
    role: 'ct_cat',
    team: 'CT',
    label: 'Cat',
    site: 'A',
    holdRadius: 11,
    path: [
      { x: 32, y: 6, z: -65 },
      { x: 42, y: 10, z: -50 },
      { x: 52, y: 12, z: -42 },
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
