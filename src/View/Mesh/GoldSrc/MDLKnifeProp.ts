import * as THREE from 'three'
import { MDLFramePlayer } from './MDLFramePlayer'
import type { MDLMeshPart, MDLViewmodel } from './loadGoldSrcMDL'

/**
 * Root-bone local seat (M9 sketch / AWP attach flow).
 * Z must stay negative — positive Z pushes the blade past the near clip plane.
 */
export const BUTTERFLY_KNIFE_SEAT = {
  position: new THREE.Vector3(0.16, -0.101, -0.26),
  rotation: new THREE.Euler(0.12, Math.PI, 0.05, 'XYZ'),
  scaleMul: 1.38,
}

/** GoldSrc MDL axis → Three.js (web-hlmv). */
const GRIP_ORIENT = new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'XYZ')

export function findKnifeSeatBone(root: THREE.Object3D): THREE.Object3D | undefined {
  let seat: THREE.Object3D | undefined
  root.traverse((c) => {
    if (c.name === 'Root' && c.parent?.name === 'Armature') seat = c
  })
  if (!seat) {
    root.traverse((c) => {
      if (!seat && c.name === 'Armature') seat = c
    })
  }
  return seat
}

export function cloneKnifeProp(template: MDLViewmodel): {
  group: THREE.Group
  framePlayer: MDLFramePlayer
  animations: THREE.AnimationClip[]
} {
  const group = new THREE.Group()
  group.name = 'ButterflyKnifePropRoot'

  const orient = new THREE.Group()
  orient.name = 'GoldSrcOrient'
  orient.rotation.copy(GRIP_ORIENT)
  const tplOrient = template.root.children[0]
  if (tplOrient) orient.position.copy(tplOrient.position)
  group.add(orient)
  group.scale.copy(template.root.scale).multiplyScalar(BUTTERFLY_KNIFE_SEAT.scaleMul)

  const parts: MDLMeshPart[] = []

  for (const src of template.parts) {
    const geometry = src.mesh.geometry.clone()
    const material = (src.mesh.material as THREE.Material).clone()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.visible = true
    mesh.castShadow = false
    mesh.receiveShadow = false
    orient.add(mesh)
    parts.push({ mesh, framePositions: src.framePositions })
  }

  const framePlayer = new MDLFramePlayer(
    parts,
    template.sequences,
    template.restSeqIndex,
    template.restFrame
  )
  framePlayer.holdDrawStart()

  return { group, framePlayer, animations: template.animations }
}

export function seatKnifePropOnHands(prop: THREE.Group, viewmodelRoot: THREE.Object3D): boolean {
  prop.visible = true
  prop.frustumCulled = false
  prop.traverse((c) => {
    c.visible = true
    c.frustumCulled = false
  })

  prop.position.copy(BUTTERFLY_KNIFE_SEAT.position)
  prop.rotation.copy(BUTTERFLY_KNIFE_SEAT.rotation)

  viewmodelRoot.add(prop)
  viewmodelRoot.updateMatrixWorld(true)

  const seat = findKnifeSeatBone(viewmodelRoot)
  if (!seat) {
    console.warn('[Butterfly] Armature/Root not found — knife prop left on viewmodel root')
    return false
  }
  seat.attach(prop)
  initKnifePropTuneData(prop)
  return true
}

/** Snapshot base scale after seating so editor +/- only adjusts from this. */
export function initKnifePropTuneData(prop: THREE.Group): void {
  prop.userData.knifeBaseScale = prop.scale.x
  prop.userData.knifeScaleTune = 1
}

export function getKnifeProp(root: THREE.Object3D): THREE.Group | undefined {
  return root.getObjectByName(BUTTERFLY_KNIFE_PROP) as THREE.Group | undefined
}

export function resetKnifePropSeat(prop: THREE.Group): void {
  prop.position.copy(BUTTERFLY_KNIFE_SEAT.position)
  prop.rotation.copy(BUTTERFLY_KNIFE_SEAT.rotation)
  prop.userData.knifeScaleTune = 1
  const base = prop.userData.knifeBaseScale as number | undefined
  if (base !== undefined) prop.scale.setScalar(base)
}

export function nudgeKnifePropPosition(
  prop: THREE.Group,
  axis: 'x' | 'y' | 'z',
  delta: number
): void {
  prop.position[axis] += delta
}

export function nudgeKnifePropScale(prop: THREE.Group, delta: number): void {
  const base = prop.userData.knifeBaseScale as number | undefined
  if (base === undefined) return
  const tune = Math.max(0.25, Math.min(2.5, ((prop.userData.knifeScaleTune as number) ?? 1) + delta))
  prop.userData.knifeScaleTune = tune
  prop.scale.setScalar(base * tune)
}

export function getKnifePropTune(prop: THREE.Group): {
  position: THREE.Vector3
  scaleTune: number
} {
  return {
    position: prop.position.clone(),
    scaleTune: (prop.userData.knifeScaleTune as number) ?? 1,
  }
}

export const BUTTERFLY_KNIFE_PROP = 'ButterflyKnifeProp'

export function getKnifeFramePlayer(root: THREE.Object3D): MDLFramePlayer | undefined {
  const prop = root.getObjectByName(BUTTERFLY_KNIFE_PROP)
  return prop?.userData?.knifeFramePlayer as MDLFramePlayer | undefined
}

export function getKnifeClipDuration(
  root: THREE.Object3D,
  clipName: string,
  timeScale = 1
): number {
  return getKnifeFramePlayer(root)?.getSequenceDuration(clipName, timeScale) ?? 0
}

export function holdKnifeDrawStart(root: THREE.Object3D): void {
  getKnifeFramePlayer(root)?.holdDrawStart()
}

export function playKnifeClip(root: THREE.Object3D, clipName: string, loop = false, timeScale = 1): number {
  const player = getKnifeFramePlayer(root)
  if (!player) return 0
  return player.play(clipName, loop, timeScale)
}

export function updateKnifeProp(root: THREE.Object3D, dt: number): void {
  getKnifeFramePlayer(root)?.update(dt)
}

export function holdKnifeRest(root: THREE.Object3D): void {
  getKnifeFramePlayer(root)?.holdRest()
}

export function holdKnifeClipEnd(root: THREE.Object3D, clipName: string): void {
  getKnifeFramePlayer(root)?.holdClipEnd(clipName)
}

export function setKnifePropVisible(root: THREE.Object3D, visible: boolean): void {
  const prop = getKnifeProp(root)
  if (!prop) return
  prop.visible = visible
  prop.traverse((c) => {
    c.visible = visible
  })
}
