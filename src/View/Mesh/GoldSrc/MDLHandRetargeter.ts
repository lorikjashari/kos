import * as THREE from 'three'
import { calcBoneQuatRelativeToWeapon, calcBoneTransforms, calcLocalBoneQuaternion } from './MDLRig'
import type { MDLModelData, MDLSequence } from './MDLTypes'
import type { MDLSequenceInfo } from './loadGoldSrcMDL'
import type { MDLFramePlayer } from './MDLFramePlayer'

type BoneBind = {
  bone: THREE.Bone
  mdlIndex: number
  glbRestQuat: THREE.Quaternion
  mdlRestQuat: THREE.Quaternion
  weaponRelative: boolean
}

/** Single GLB pivot — composite all CS cshands local bone deltas (M9 usually only has Root). */
type PivotChainLink = {
  mdlIndex: number
  mdlRestLocalQuat: THREE.Quaternion
}

type PivotBind = {
  pivot: THREE.Object3D
  glbRestQuat: THREE.Quaternion
  chain: PivotChainLink[]
}

/** CS 1.6 cshands Bip01 → M9 sketch GLB bone names (52-joint rig under `root`). */
const CS_TO_M9_HAND_BONES: Record<string, string[]> = {
  // CS forearm is a root bone — maps to M9 upper arm (not both upper+forearm).
  Bip01_R_Forearm: ['r_upperarm'],
  Bip01_R_Hand: ['r_wrist'],
  Bip01_R_Finger0: ['r_thumb_low'],
  Bip01_R_Finger01: ['r_thumb_mid'],
  Bip01_R_Finger02: ['r_thumb_tip'],
  Bip01_R_Finger1: ['r_index_low'],
  Bip01_R_Finger11: ['r_index_mid'],
  Bip01_R_Finger12: ['r_index_tip'],
  Bip01_R_Finger2: ['r_middle_low'],
  Bip01_R_Finger21: ['r_middle_mid'],
  Bip01_R_Finger22: ['r_middle_tip'],
  Bip01_R_Finger3: ['r_ring_low'],
  Bip01_R_Finger31: ['r_ring_mid'],
  Bip01_R_Finger32: ['r_ring_tip'],
  Bip01_R_Finger4: ['r_pinky_low'],
  Bip01_R_Finger41: ['r_pinky_mid'],
  Bip01_R_Finger42: ['r_pinky_tip'],
  Bip01_L_Forearm: ['l_upperarm'],
  Bip01_L_Hand: ['l_wrist'],
  Bip01_L_Finger0: ['l_thumb_low'],
  Bip01_L_Finger01: ['l_thumb_mid'],
  Bip01_L_Finger02: ['l_thumb_tip'],
  Bip01_L_Finger1: ['l_index_low'],
  Bip01_L_Finger11: ['l_index_mid'],
  Bip01_L_Finger12: ['l_index_tip'],
  Bip01_L_Finger2: ['l_middle_low'],
  Bip01_L_Finger21: ['l_middle_mid'],
  Bip01_L_Finger22: ['l_middle_tip'],
  Bip01_L_Finger3: ['l_ring_low'],
  Bip01_L_Finger31: ['l_ring_mid'],
  Bip01_L_Finger32: ['l_ring_tip'],
  Bip01_L_Finger4: ['l_pinky_low'],
  Bip01_L_Finger41: ['l_pinky_mid'],
  Bip01_L_Finger42: ['l_pinky_tip'],
}

/** CS cshands root bones use weapon-relative rotation; fingers stay local. */
const WEAPON_RELATIVE_KEYS = new Set(['Bip01_R_Forearm', 'Bip01_L_Forearm', 'Bip01_R_Hand', 'Bip01_L_Hand'])

/** Scale arm deltas down — CS root forearm swings are large in local space. */
const ARM_DELTA_DAMPING = 0.42
const FINGER_DELTA_DAMPING = 0.88

function dampedDelta(delta: THREE.Quaternion, amount: number): THREE.Quaternion {
  return new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), delta, amount)
}

function weaponRelativeQuat(
  model: MDLModelData,
  seq: MDLSequence,
  frame: number,
  boneIndex: number,
  weaponIndex: number
): THREE.Quaternion {
  const transforms = calcBoneTransforms(model, seq, frame)
  return calcBoneQuatRelativeToWeapon(transforms, weaponIndex, boneIndex)
}

function isCshandsMdlBone(name: string): boolean {
  return name.includes('Bip01') && !name.includes('ForeTwist')
}

function mdlHandKey(name: string): string | null {
  if (!isCshandsMdlBone(name)) return null
  return name.replace(/^v_weapon\./, '')
}

function collectGlbBones(viewmodelRoot: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = []
  const seen = new Set<THREE.Bone>()
  viewmodelRoot.traverse((c) => {
    const sk = c as THREE.SkinnedMesh
    if (sk.isSkinnedMesh && sk.skeleton) {
      for (const b of sk.skeleton.bones) {
        if (!seen.has(b)) {
          seen.add(b)
          bones.push(b)
        }
      }
    }
    const bone = c as THREE.Bone
    if (bone.isBone && !seen.has(bone)) {
      seen.add(bone)
      bones.push(bone)
    }
  })
  return bones
}

function findGlbBone(bones: THREE.Bone[], key: string): THREE.Bone | undefined {
  const lower = key.toLowerCase()
  for (const b of bones) {
    const n = b.name
    if (n === key || n.toLowerCase() === lower) return b
    if (n.endsWith(`:${key}`) || n.endsWith(`_${key}`)) return b
    const stripped = n
      .replace(/^mixamorig:?/i, '')
      .replace(/^Armature[|._]/i, '')
      .replace(/^Root[|._]/i, '')
    if (stripped === key || stripped.toLowerCase() === lower || stripped.endsWith(key)) return b
  }
  return undefined
}

function findAnimPivot(viewmodelRoot: THREE.Object3D, bones: THREE.Bone[]): THREE.Object3D {
  const skRoot = findGlbBone(bones, 'root')
  if (skRoot) return skRoot

  const rootBone = findGlbBone(bones, 'Root')
  if (rootBone) return rootBone

  let armature: THREE.Object3D | undefined
  viewmodelRoot.traverse((c) => {
    if (!armature && c.name === 'Armature') armature = c
  })
  return armature ?? bones[0] ?? viewmodelRoot
}

/** All cshands bones — Bip01 arms are separate MDL roots, not under v_weapon. */
function collectCshandsChain(model: MDLModelData): number[] {
  const indices: number[] = []
  for (let i = 0; i < model.bones.length; i++) {
    if (isCshandsMdlBone(model.bones[i]!.name)) indices.push(i)
  }
  return indices
}

/**
 * Apply CS 1.6 MDL cshands motion onto the M9 GLB skeleton.
 * Per-bone map when names match; otherwise composite the full Bip01 chain onto Root/Armature.
 */
export class MDLHandRetargeter {
  private readonly model: MDLModelData
  private readonly sequences: MDLSequence[]
  private readonly binds: BoneBind[] = []
  private pivot: PivotBind | null = null
  private readonly viewRoot: THREE.Object3D
  private readonly weaponIndex: number
  private readonly mdlRestFrame: number

  constructor(model: MDLModelData, viewmodelRoot: THREE.Object3D, mdlRestFrameOverride?: number) {
    this.model = model
    this.viewRoot = viewmodelRoot
    this.sequences = model.sequences.filter((s) => s.numFrames > 0)
    this.weaponIndex = Math.max(0, model.bones.findIndex((b) => b.name === 'v_weapon'))

    viewmodelRoot.updateMatrixWorld(true)

    const glbBones = collectGlbBones(viewmodelRoot)

    const drawSeq = this.sequences.find((s) => s.label === 'draw')
    if (!drawSeq) {
      this.mdlRestFrame = 0
      return
    }
    const idleFrame = Math.max(0, drawSeq.numFrames - 1)
    this.mdlRestFrame = Math.min(
      drawSeq.numFrames - 1,
      Math.max(0, mdlRestFrameOverride ?? idleFrame)
    )

    for (let i = 0; i < model.bones.length; i++) {
      const key = mdlHandKey(model.bones[i]!.name)
      if (!key) continue
      const m9Names = CS_TO_M9_HAND_BONES[key]
      if (!m9Names?.length) continue
      const weaponRelative = WEAPON_RELATIVE_KEYS.has(key)
      const mdlRestQuat = weaponRelative
        ? weaponRelativeQuat(model, drawSeq, this.mdlRestFrame, i, this.weaponIndex)
        : calcLocalBoneQuaternion(model, drawSeq, this.mdlRestFrame, i)

      for (const m9Name of m9Names) {
        const bone = findGlbBone(glbBones, m9Name)
        if (!bone) continue
        this.binds.push({
          bone,
          mdlIndex: i,
          glbRestQuat: bone.quaternion.clone(),
          mdlRestQuat,
          weaponRelative,
        })
      }
    }

    if (this.binds.length === 0) {
      const pivot = findAnimPivot(viewmodelRoot, glbBones)
      const chain: PivotChainLink[] = []
      for (const idx of collectCshandsChain(model)) {
        chain.push({
          mdlIndex: idx,
          mdlRestLocalQuat: calcLocalBoneQuaternion(model, drawSeq, this.mdlRestFrame, idx),
        })
      }
      if (chain.length > 0) {
        this.pivot = {
          pivot,
          glbRestQuat: pivot.quaternion.clone(),
          chain,
        }
      }
    }
  }

  public get mappedBoneCount(): number {
    if (this.binds.length > 0) return this.binds.length
    return this.pivot?.chain.length ?? 0
  }

  public applyFrames(seqIndex: number, frameA: number, _seqInfo: MDLSequenceInfo, blendT = 0): void {
    if (this.binds.length === 0 && !this.pivot) return
    const seq = this.sequences[seqIndex]
    if (!seq) return

    const f0 = Math.min(seq.numFrames - 1, Math.max(0, Math.floor(frameA)))
    const f1 = Math.min(seq.numFrames - 1, f0 + 1)
    const t = Math.min(1, Math.max(0, blendT))

    if (this.pivot) {
      let combined = new THREE.Quaternion()
      for (const link of this.pivot.chain) {
        const qA = calcLocalBoneQuaternion(this.model, seq, f0, link.mdlIndex)
        const qB = calcLocalBoneQuaternion(this.model, seq, f1, link.mdlIndex)
        const nowLocal = qA.clone().slerp(qB, t)
        const delta = nowLocal.clone().multiply(link.mdlRestLocalQuat.clone().invert())
        combined.multiply(delta)
      }
      this.pivot.pivot.quaternion.copy(this.pivot.glbRestQuat).premultiply(combined)
    } else {
      const frame = f0 + t * (f1 - f0)
      for (const bind of this.binds) {
        const qNow = bind.weaponRelative
          ? weaponRelativeQuat(this.model, seq, frame, bind.mdlIndex, this.weaponIndex)
          : this.sampleLocalQuat(seq, f0, f1, t, bind.mdlIndex)

        const delta = qNow.clone().multiply(bind.mdlRestQuat.clone().invert())
        const damping = bind.weaponRelative ? ARM_DELTA_DAMPING : FINGER_DELTA_DAMPING
        const damped = dampedDelta(delta, damping)
        bind.bone.quaternion.copy(bind.glbRestQuat).multiply(damped)
      }
    }

    this.viewRoot.traverse((c) => {
      const sk = c as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) sk.skeleton?.update()
    })
    this.viewRoot.updateMatrixWorld(true)
  }

  private sampleLocalQuat(
    seq: MDLSequence,
    f0: number,
    f1: number,
    t: number,
    boneIndex: number
  ): THREE.Quaternion {
    const qA = calcLocalBoneQuaternion(this.model, seq, f0, boneIndex)
    const qB = calcLocalBoneQuaternion(this.model, seq, f1, boneIndex)
    return qA.clone().slerp(qB, t)
  }
}

export function createHandRetargeter(
  model: MDLModelData,
  viewmodelRoot: THREE.Object3D,
  mdlRestFrame?: number
): MDLHandRetargeter {
  return new MDLHandRetargeter(model, viewmodelRoot, mdlRestFrame)
}

export function bindHandRetargeterToPlayer(
  player: MDLFramePlayer | undefined,
  retargeter: MDLHandRetargeter
): void {
  if (player) player.handRetargeter = retargeter
}

export function pauseViewmodelGlbMixer(fpsMesh: {
  mesh: THREE.Object3D
  mixer?: THREE.AnimationMixer
}): void {
  fpsMesh.mixer?.stopAllAction()
}

/** Freeze M9 GLB at Switch end without touching baked bf_* hand clips. */
export function holdM9SwitchEndPose(fps: {
  mesh: THREE.Object3D
  mixer?: THREE.AnimationMixer
  animations: Map<string, { End?: { time: number } }>
}): void {
  fps.mixer?.stopAllAction()
  const sw = fps.animations.get('Switch')
  const time = sw?.End?.time ?? 2.3
  if (!fps.mixer || !fps.mesh?.animations?.length) return

  for (const clip of fps.mesh.animations) {
    if (clip.name.startsWith('bf_')) continue
    const action = fps.mixer.clipAction(clip)
    action.reset()
    action.enabled = true
    action.loop = THREE.LoopOnce
    action.clampWhenFinished = true
    action.timeScale = 1
    action.time = Math.max(0, Math.min(time, clip.duration))
    action.paused = true
    action.play()
  }
  fps.mixer.update(0)
}
