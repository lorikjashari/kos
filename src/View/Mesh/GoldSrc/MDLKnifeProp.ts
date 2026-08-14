import * as THREE from 'three'
import { bindKnifeWristFollower, findKnifeWristBone, MDLKnifeWristFollower } from './MDLKnifeFollower'
import { MDLFramePlayer } from './MDLFramePlayer'
import type { MDLHandRetargeter } from './MDLHandRetargeter'
import type { MDLMeshPart, MDLViewmodel } from './loadGoldSrcMDL'
import { csMdlKnifePropNames, CS_MDL_KNIVES, DEFAULT_CS_KNIFE_SEAT, type CsMdlKnifeKey, type CsMdlKnifeSeat } from './CsMdlKnife'

/**
 * Screen-space seat for the full CS MDL viewmodel (hands + knife).
 * Replaces M9 GLB meshes — all motion comes from the MDL sequences.
 */
export const BUTTERFLY_VIEWMODEL_SEAT = {
  position: new THREE.Vector3(0.14, -0.11, -0.24),
  rotation: new THREE.Euler(0.08, Math.PI, 0.04, 'XYZ'),
  scaleMul: 1.0,
}

/** Legacy knife-only seat (editor / knife nudge when split prop). */
export const BUTTERFLY_KNIFE_SEAT = DEFAULT_CS_KNIFE_SEAT

/** GoldSrc MDL axis → Three.js (web-hlmv). */
const GRIP_ORIENT = new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'XYZ')

const _gripBox = new THREE.Box3()
const _gripScratch = new THREE.Vector3()
const _gripMin = new THREE.Vector3()
const _gripMax = new THREE.Vector3()
const _gripMinW = new THREE.Vector3()
const _gripMaxW = new THREE.Vector3()

/** Handle end in prop-local space — picks Y extreme nearest the wrist (after GoldSrcOrient). */
export function computeKnifeGripLocal(prop: THREE.Group, wristWorld?: THREE.Vector3): THREE.Vector3 {
  _gripBox.makeEmpty()
  prop.updateMatrixWorld(true)
  prop.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    for (let i = 0; i < pos.count; i++) {
      _gripScratch.fromBufferAttribute(pos, i)
      mesh.localToWorld(_gripScratch)
      prop.worldToLocal(_gripScratch)
      _gripBox.expandByPoint(_gripScratch)
    }
  })
  if (_gripBox.isEmpty()) return new THREE.Vector3()

  const center = _gripBox.getCenter(new THREE.Vector3())
  _gripMin.set(center.x, _gripBox.min.y, center.z)
  _gripMax.set(center.x, _gripBox.max.y, center.z)
  if (!wristWorld) return _gripMin.clone()

  _gripMinW.copy(_gripMin)
  _gripMaxW.copy(_gripMax)
  prop.localToWorld(_gripMinW)
  prop.localToWorld(_gripMaxW)
  return _gripMinW.distanceToSquared(wristWorld) <= _gripMaxW.distanceToSquared(wristWorld)
    ? _gripMin.clone()
    : _gripMax.clone()
}

/** Move prop so grip point meets r_wrist — karambit handle aligns with M9 palm. */
export function alignKnifePropGripToWrist(
  prop: THREE.Group,
  viewmodelRoot: THREE.Object3D,
  gripOffset = new THREE.Vector3()
): boolean {
  const wrist = findKnifeWristBone(viewmodelRoot)
  const parent = prop.parent
  if (!wrist || !parent) return false

  viewmodelRoot.updateMatrixWorld(true)
  wrist.updateMatrixWorld(true)

  const wristWorld = _gripScratch.setFromMatrixPosition(wrist.matrixWorld)
  const gripLocal = computeKnifeGripLocal(prop, wristWorld).add(gripOffset)

  prop.updateMatrixWorld(true)
  parent.updateMatrixWorld(true)

  const gripWorld = gripLocal.clone()
  prop.localToWorld(gripWorld)

  const deltaWorld = wristWorld.clone().sub(gripWorld)

  const propWorld = new THREE.Vector3()
  prop.getWorldPosition(propWorld)
  propWorld.add(deltaWorld)
  parent.worldToLocal(propWorld)
  prop.position.copy(propWorld)
  return true
}

export type KnifeSeatOptions = {
  alignGripToWrist?: boolean
  gripOffset?: THREE.Vector3
}

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
  // M9 sketch hands have no Armature — knife stays on the viewmodel root and
  // MDLKnifeWristFollower tracks r_wrist (same as the working butterfly path).
  return seat
}

/** Combined CS knife + cshands at viewmodel scale — keeps hand/knife alignment from the MDL. */
const BUTTERFLY_ANIM_SCREEN_SCALE = 0.58

export function cloneButterflyAnimProp(template: MDLViewmodel): {
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
  group.scale
    .copy(template.root.scale)
    .multiplyScalar(BUTTERFLY_VIEWMODEL_SEAT.scaleMul * BUTTERFLY_ANIM_SCREEN_SCALE)

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
  framePlayer.holdRest()

  return { group, framePlayer, animations: template.animations }
}

export function cloneKnifeProp(
  template: MDLViewmodel,
  opts?: { scaleMul?: number; rootName?: string; gripOrient?: THREE.Euler }
): {
  group: THREE.Group
  framePlayer: MDLFramePlayer
  animations: THREE.AnimationClip[]
} {
  const scaleMul = opts?.scaleMul ?? BUTTERFLY_KNIFE_SEAT.scaleMul
  const gripOrient = opts?.gripOrient ?? GRIP_ORIENT
  const group = new THREE.Group()
  group.name = opts?.rootName ?? 'CsKnifePropRoot'

  const orient = new THREE.Group()
  orient.name = 'GoldSrcOrient'
  orient.rotation.copy(gripOrient)
  const tplOrient = template.root.children[0]
  if (tplOrient) orient.position.copy(tplOrient.position)
  group.add(orient)
  group.scale.copy(template.root.scale).multiplyScalar(scaleMul)

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
  framePlayer.holdRest()

  return { group, framePlayer, animations: template.animations }
}

/** @deprecated Full MDL viewmodel clone — do not use for FPS (includes cshands). */
export function cloneButterflyViewmodel(
  template: MDLViewmodel,
  scaleMul = BUTTERFLY_VIEWMODEL_SEAT.scaleMul
): {
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
  group.scale.copy(template.root.scale).multiplyScalar(scaleMul)

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

const _seatScratch = {
  local: new THREE.Matrix4(),
  world: new THREE.Matrix4(),
  invView: new THREE.Matrix4(),
  quat: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
}

/**
 * Seat the CS MDL anim prop (cshands + knife) on the viewmodel at the tuned screen XYZ.
 */
export function seatButterflyAnimProp(prop: THREE.Group, viewmodelRoot: THREE.Object3D): boolean {
  return seatMdlPropOnViewmodel(prop, viewmodelRoot, BUTTERFLY_VIEWMODEL_SEAT)
}

function seatMdlPropOnViewmodel(
  prop: THREE.Group,
  viewmodelRoot: THREE.Object3D,
  seat: { position: THREE.Vector3; rotation: THREE.Euler }
): boolean {
  prop.visible = true
  prop.frustumCulled = false
  prop.traverse((c) => {
    c.visible = true
    c.frustumCulled = false
  })

  viewmodelRoot.updateMatrixWorld(true)
  const seatBone = findKnifeSeatBone(viewmodelRoot)
  const keepScale = prop.scale.clone()

  if (seatBone) {
    _seatScratch.quat.setFromEuler(seat.rotation)
    _seatScratch.local.compose(
      seat.position,
      _seatScratch.quat,
      _seatScratch.scale.set(1, 1, 1)
    )
    _seatScratch.world.multiplyMatrices(seatBone.matrixWorld, _seatScratch.local)
    _seatScratch.invView.copy(viewmodelRoot.matrixWorld).invert()
    _seatScratch.world.premultiply(_seatScratch.invView)
    _seatScratch.world.decompose(prop.position, prop.quaternion, _seatScratch.scale)
    prop.scale.copy(keepScale)
  } else {
    console.warn('[Butterfly] Armature/Root not found — using raw seat on viewmodel root')
    prop.position.copy(seat.position)
    prop.rotation.copy(seat.rotation)
  }

  viewmodelRoot.add(prop)
  initKnifePropTuneData(prop)
  return !!seatBone
}

/**
 * Seat knife on M9 Armature/Root — follows hand bone during CS animation.
 */
export function seatKnifePropOnHands(
  prop: THREE.Group,
  viewmodelRoot: THREE.Object3D,
  seat: CsMdlKnifeSeat = BUTTERFLY_KNIFE_SEAT,
  opts?: KnifeSeatOptions
): boolean {
  prop.visible = true
  prop.frustumCulled = false
  prop.traverse((c) => {
    c.visible = true
    c.frustumCulled = false
  })

  prop.position.copy(opts?.alignGripToWrist ? new THREE.Vector3(0, 0, 0) : seat.position)
  prop.rotation.copy(seat.rotation)

  viewmodelRoot.add(prop)
  viewmodelRoot.updateMatrixWorld(true)

  const seatBone = findKnifeSeatBone(viewmodelRoot)
  if (seatBone) {
    seatBone.attach(prop)
  } else {
    console.warn('[CsKnife] Armature/Root not found — knife prop left on viewmodel root')
  }

  if (opts?.alignGripToWrist) {
    alignKnifePropGripToWrist(prop, viewmodelRoot, opts.gripOffset)
  }

  initKnifePropTuneData(prop)
  return !!seatBone
}

/** @deprecated */
export function seatButterflyViewmodel(prop: THREE.Group, viewmodelRoot: THREE.Object3D): boolean {
  return seatKnifePropOnHands(prop, viewmodelRoot)
}

/** Snapshot base scale after seating so editor +/- only adjusts from this. */
export function initKnifePropTuneData(prop: THREE.Group): void {
  prop.userData.knifeBaseScale = prop.scale.x
  prop.userData.knifeScaleTune = 1
  prop.userData.knifeRestPosition = prop.position.clone()
  prop.userData.knifeRestQuaternion = prop.quaternion.clone()
}

export function resetKnifePropSeat(prop: THREE.Group, seat: CsMdlKnifeSeat = BUTTERFLY_KNIFE_SEAT): void {
  const restPos = prop.userData.knifeRestPosition as THREE.Vector3 | undefined
  const restQuat = prop.userData.knifeRestQuaternion as THREE.Quaternion | undefined
  if (restPos && restQuat) {
    prop.position.copy(restPos)
    prop.quaternion.copy(restQuat)
  } else {
    prop.position.copy(BUTTERFLY_KNIFE_SEAT.position)
    prop.rotation.copy(BUTTERFLY_KNIFE_SEAT.rotation)
  }
  prop.userData.knifeScaleTune = 1
  const base = prop.userData.knifeBaseScale as number | undefined
  if (base !== undefined) prop.scale.setScalar(base)
  const follower = prop.userData.knifeWristFollower as MDLKnifeWristFollower | undefined
  follower?.syncRestFromProp()
}

export function nudgeKnifePropPosition(
  prop: THREE.Group,
  axis: 'x' | 'y' | 'z',
  delta: number
): void {
  prop.position[axis] += delta
  const follower = prop.userData.knifeWristFollower as MDLKnifeWristFollower | undefined
  follower?.nudgeRestPosition(axis, delta)
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

export function findCsKnifeProp(root: THREE.Object3D, key?: CsMdlKnifeKey): THREE.Group | undefined {
  if (key) {
    const name = CS_MDL_KNIVES[key].propName
    const prop = root.getObjectByName(name)
    return prop ? (prop as THREE.Group) : undefined
  }
  for (const name of csMdlKnifePropNames()) {
    const prop = root.getObjectByName(name)
    if (prop) return prop as THREE.Group
  }
  return undefined
}

export function removeCsKnifeProps(root: THREE.Object3D): void {
  for (const name of csMdlKnifePropNames()) {
    const prop = root.getObjectByName(name)
    prop?.parent?.remove(prop)
  }
}

export function getKnifeProp(root: THREE.Object3D, key?: CsMdlKnifeKey): THREE.Group | undefined {
  return findCsKnifeProp(root, key)
}

export function getKnifeFramePlayer(root: THREE.Object3D, key?: CsMdlKnifeKey): MDLFramePlayer | undefined {
  const prop = findCsKnifeProp(root, key)
  return prop?.userData?.knifeFramePlayer as MDLFramePlayer | undefined
}

export function bindHandRetargeter(root: THREE.Object3D, retargeter: MDLHandRetargeter, key?: CsMdlKnifeKey): void {
  const player = getKnifeFramePlayer(root, key)
  if (player) player.handRetargeter = retargeter
}

export function getKnifeClipDuration(
  root: THREE.Object3D,
  clipName: string,
  timeScale = 1,
  key?: CsMdlKnifeKey
): number {
  return getKnifeFramePlayer(root, key)?.getSequenceDuration(clipName, timeScale) ?? 0
}

export function getKnifePlayProgress(root: THREE.Object3D, key?: CsMdlKnifeKey): number {
  return getKnifeFramePlayer(root, key)?.getSequenceProgress() ?? 1
}

export function holdKnifeDrawStart(root: THREE.Object3D, key?: CsMdlKnifeKey): void {
  getKnifeFramePlayer(root, key)?.holdDrawStart()
  syncKnifeWristFollower(root, key)
}

export function playKnifeClip(
  root: THREE.Object3D,
  clipName: string,
  loop = false,
  timeScale = 1,
  key?: CsMdlKnifeKey
): number {
  const player = getKnifeFramePlayer(root, key)
  if (!player) return 0
  const dur = player.play(clipName, loop, timeScale)
  syncKnifeWristFollower(root, key)
  return dur
}

export function bindKnifeWristFollowerToProp(
  viewmodelRoot: THREE.Object3D,
  prop: THREE.Group
): MDLKnifeWristFollower | null {
  const follower = bindKnifeWristFollower(viewmodelRoot, prop)
  if (follower) prop.userData.knifeWristFollower = follower
  return follower
}

export function updateKnifeProp(root: THREE.Object3D, dt: number, key?: CsMdlKnifeKey): void {
  const player = getKnifeFramePlayer(root, key)
  player?.update(dt)
  const prop = getKnifeProp(root, key)
  const follower = prop?.userData?.knifeWristFollower as MDLKnifeWristFollower | undefined
  follower?.update(dt, player?.isPlaying() ?? false)
}

function syncKnifeWristFollower(root: THREE.Object3D, key?: CsMdlKnifeKey): void {
  const prop = getKnifeProp(root, key)
  const follower = prop?.userData?.knifeWristFollower as MDLKnifeWristFollower | undefined
  follower?.syncToWrist()
}

function resetKnifeWristFollower(root: THREE.Object3D, key?: CsMdlKnifeKey): void {
  const prop = getKnifeProp(root, key)
  const follower = prop?.userData?.knifeWristFollower as MDLKnifeWristFollower | undefined
  follower?.snapToRest()
}

export function holdKnifeRest(root: THREE.Object3D, key?: CsMdlKnifeKey): void {
  getKnifeFramePlayer(root, key)?.holdRest()
  resetKnifeWristFollower(root, key)
}

export function holdKnifeClipEnd(root: THREE.Object3D, clipName: string, key?: CsMdlKnifeKey): void {
  getKnifeFramePlayer(root, key)?.holdClipEnd(clipName)
}

export function setKnifePropVisible(root: THREE.Object3D, visible: boolean, key?: CsMdlKnifeKey): void {
  const prop = getKnifeProp(root, key)
  if (!prop) return
  prop.visible = visible
  prop.traverse((c) => {
    c.visible = visible
  })
}
