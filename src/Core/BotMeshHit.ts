import * as THREE from 'three'
import type { BodyPart } from './BodyPart'

/** Map RobotExpressive mesh names → CS hit zones */
export function bodyPartFromMeshName(name: string): BodyPart | undefined {
  const n = name.toLowerCase()
  if (n.includes('humanhead') || n.includes('head') || n.includes('eye') || n.includes('brow') || n.includes('skull')) {
    // Don't treat "Head" bone as a hit mesh — only real head geometry
    if (n === 'head') return undefined
    return 'head'
  }
  if (n.includes('leg') || n.includes('foot') || n.includes('thigh') || n.includes('shin')) return 'legs'
  if (
    n.includes('torso') ||
    n.includes('body') ||
    n.includes('chest') ||
    n.includes('arm') ||
    n.includes('hand') ||
    n.includes('shoulder') ||
    n.includes('spine') ||
    n.includes('hip') ||
    n.includes('pelvis')
  ) {
    return 'body'
  }
  return undefined
}

export const MESH_HIT_COLORS: Record<BodyPart, number> = {
  head: 0xff2222,
  body: 0xffcc00,
  legs: 0x22aaff,
}

export interface BotMeshHit {
  botIndex: number
  part: BodyPart
  point: THREE.Vector3
  normal: THREE.Vector3
  distance: number
  object: THREE.Object3D
}

/**
 * Safety net for models whose head geometry overlaps the torso (the zones on the
 * CS terrorist meet at seams, but the robot's tagged meshes interpenetrate).
 * When a torso surface wins by less than this, but the ray also passed through
 * the same bot's head, the shot was aimed at the head — score it as one.
 * Deliberately small: a ray fired steeply upward through the chest can legally
 * exit into the head volume, and that must stay a body hit.
 */
const HEAD_PRIORITY_MARGIN = 0.35

/**
 * Raycast against actual robot meshes (exact silhouette / curves).
 * Call after mesh matrixWorld is up to date for the frame.
 */
export function raycastBotMeshes(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  targets: Array<{ botIndex: number; root: THREE.Object3D; alive: boolean }>,
  maxDistance: number
): BotMeshHit | undefined {
  const raycaster = new THREE.Raycaster(origin, direction.clone().normalize(), 0, maxDistance)
  let best: BotMeshHit | undefined
  let bestHead: BotMeshHit | undefined

  for (const t of targets) {
    if (!t.alive || !t.root.visible) continue
    const hits = raycaster.intersectObject(t.root, true)
    for (const hit of hits) {
      // The held weapon prop floats in front of the hand — never a hit surface,
      // otherwise bullets "stop in the air" on the gun instead of hitting the bot.
      if (isGunPart(hit.object)) continue
      const part = findBodyPart(hit.object)
      if (!part) continue
      const candidate: BotMeshHit = {
        botIndex: t.botIndex,
        part,
        point: hit.point.clone(),
        normal: (hit.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1))
          .transformDirection(hit.object.matrixWorld)
          .normalize(),
        distance: hit.distance,
        object: hit.object,
      }
      if (!best || candidate.distance < best.distance) best = candidate
      if (part === 'head' && (!bestHead || candidate.distance < bestHead.distance)) bestHead = candidate
    }
  }

  if (
    best &&
    bestHead &&
    best.part !== 'head' &&
    bestHead.botIndex === best.botIndex &&
    bestHead.distance - best.distance <= HEAD_PRIORITY_MARGIN
  ) {
    return bestHead
  }
  return best
}

/** True if this object or any ancestor is a held weapon prop (userData.isGun). */
function isGunPart(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    if (cur.userData?.isGun) return true
    cur = cur.parent
  }
  return false
}

function findBodyPart(obj: THREE.Object3D): BodyPart | undefined {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    const part = bodyPartFromMeshName(cur.name)
    if (part) return part
    const user = cur.userData?.bodyPart as BodyPart | undefined
    if (user) return user
    cur = cur.parent
  }
  return 'body' // unnamed child geometry still counts as body
}
