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

  for (const t of targets) {
    if (!t.alive || !t.root.visible) continue
    const hits = raycaster.intersectObject(t.root, true)
    for (const hit of hits) {
      const part = findBodyPart(hit.object)
      if (!part) continue
      if (!best || hit.distance < best.distance) {
        best = {
          botIndex: t.botIndex,
          part,
          point: hit.point.clone(),
          normal: (hit.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1))
            .transformDirection(hit.object.matrixWorld)
            .normalize(),
          distance: hit.distance,
          object: hit.object,
        }
      }
    }
  }
  return best
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
