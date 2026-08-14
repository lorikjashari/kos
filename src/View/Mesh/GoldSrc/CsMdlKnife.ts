import * as THREE from 'three'
import { Vector3D } from '../../../Core/Vector'
import type { MDLSubModel } from './MDLTypes'
import { isKnifeBodyPart } from './loadGoldSrcMDL'
import type { MdlKnifePartFilter } from './loadGoldSrcMDL'

/** CS 1.6 v_knife MDL viewmodels seated on M9 GLB hands. */
export type CsMdlKnifeKey = 'Butterfly' | 'Karambit'

export type CsMdlKnifeSeat = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scaleMul: number
}

export type CsMdlKnifeDef = {
  key: CsMdlKnifeKey
  mdlPath: string
  propName: string
  viewmodelOffset: Vector3D
  knifeSeat: CsMdlKnifeSeat
  /** Which MDL body sub-models to bake into the knife prop. */
  includeKnifePart: MdlKnifePartFilter
  /** Snap handle ring to r_wrist on attach (karambit pivot differs from butterfly). */
  alignGripToWrist?: boolean
  gripOffset?: THREE.Vector3
}

/** Shared seat — tune per knife in /editormode if needed. */
export const DEFAULT_CS_KNIFE_SEAT: CsMdlKnifeSeat = {
  position: new THREE.Vector3(0.16, -0.101, -0.26),
  rotation: new THREE.Euler(0.12, Math.PI, 0.05, 'XYZ'),
  scaleMul: 1.38,
}

/** /editormode tuned — Karambit fade on M9 hands. */
export const KARAMBIT_KNIFE_SEAT: CsMdlKnifeSeat = {
  position: new THREE.Vector3(0.352, 0.235, 0.149),
  rotation: new THREE.Euler(0.12, Math.PI, 0.05, 'XYZ'),
  scaleMul: 1.38,
}

/**
 * Butterfly MDL — knife_butterfly_1/2/3 are composite mesh chunks (all required).
 * Karambit MDL (PEREN pack) — karam_01..05 are composite segments (blade, grip, etc.), not LODs.
 */
export function butterflyKnifePart(sub: MDLSubModel): boolean {
  return isKnifeBodyPart(sub)
}

export function karambitKnifePart(sub: MDLSubModel): boolean {
  const n = sub.name.toLowerCase()
  if (n.includes('cshands') || n.includes('hand')) return false
  return n.startsWith('karam_')
}

export const CS_MDL_KNIVES: Record<CsMdlKnifeKey, CsMdlKnifeDef> = {
  Butterfly: {
    key: 'Butterfly',
    mdlPath: 'models/butterfly_knife.mdl',
    propName: 'ButterflyKnifeProp',
    viewmodelOffset: new Vector3D(-0.04, 0.02, 0),
    knifeSeat: DEFAULT_CS_KNIFE_SEAT,
    includeKnifePart: butterflyKnifePart,
  },
  Karambit: {
    key: 'Karambit',
    mdlPath: 'models/karambit_fade.mdl',
    propName: 'KarambitKnifeProp',
    viewmodelOffset: new Vector3D(-0.12, 0.02, 0),
    knifeSeat: KARAMBIT_KNIFE_SEAT,
    includeKnifePart: karambitKnifePart,
  },
}

export const CS_MDL_KNIFE_KEYS: CsMdlKnifeKey[] = ['Butterfly', 'Karambit']

/** Bump when MDL bake / seat changes so cached viewmodels rebuild their knife prop. */
export const CS_MDL_KNIFE_BUILD = 10

export function isCsMdlKnifeKey(key: string): key is CsMdlKnifeKey {
  return key in CS_MDL_KNIVES
}

export function isMeleeKnifeKey(key: string): boolean {
  return key === 'Knife' || isCsMdlKnifeKey(key)
}

export function getCsMdlKnifeDef(key: CsMdlKnifeKey): CsMdlKnifeDef {
  return CS_MDL_KNIVES[key]
}

export function csMdlKnifePropNames(): string[] {
  return CS_MDL_KNIFE_KEYS.map((k) => CS_MDL_KNIVES[k].propName)
}
