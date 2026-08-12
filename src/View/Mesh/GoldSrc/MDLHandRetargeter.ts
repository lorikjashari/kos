import * as THREE from 'three'
import { calcBoneTransforms } from './MDLRig'
import type { MDLModelData, MDLSequence } from './MDLTypes'
import type { MDLSequenceInfo } from './loadGoldSrcMDL'

/** GoldSrc viewmodel axis → Three.js (matches MDL knife orient). */
const GOLD_TO_THREE = new THREE.Matrix4().makeRotationFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'XYZ')
)
const THREE_TO_GOLD = GOLD_TO_THREE.clone().invert()

type BoneBind = {
  bone: THREE.Bone
  mdlIndex: number
  glbRestQuat: THREE.Quaternion
  mdlRestQuat: THREE.Quaternion
}

function mdlHandKey(name: string): string | null {
  if (!name.includes('Bip01')) return null
  if (name.includes('ForeTwist')) return null
  return name.replace(/^v_weapon\./, '')
}

function findGlbBone(bones: THREE.Bone[], key: string): THREE.Bone | undefined {
  for (const b of bones) {
    const n = b.name
    if (n === key || n.endsWith(`:${key}`) || n.endsWith(`_${key}`)) return b
    const stripped = n
      .replace(/^mixamorig:?/i, '')
      .replace(/^Armature[|._]/i, '')
      .replace(/^Root[|._]/i, '')
    if (stripped === key || stripped.endsWith(key)) return b
  }
  return undefined
}

function mdlQuat(arr: Float32Array): THREE.Quaternion {
  const m = GOLD_TO_THREE.clone().multiply(new THREE.Matrix4().fromArray(arr)).multiply(THREE_TO_GOLD)
  const q = new THREE.Quaternion()
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
  return q
}

/**
 * Apply CS MDL cshands rotation onto M9 GLB bones (rotation only — never moves bone
 * positions or the Root seat, so the knife prop stays glued to the hands).
 */
export class MDLHandRetargeter {
  private readonly model: MDLModelData
  private readonly sequences: MDLSequence[]
  private readonly binds: BoneBind[] = []
  private readonly viewRoot: THREE.Object3D

  constructor(model: MDLModelData, viewmodelRoot: THREE.Object3D) {
    this.model = model
    this.viewRoot = viewmodelRoot
    this.sequences = model.sequences.filter((s) => s.numFrames > 0)

    viewmodelRoot.updateMatrixWorld(true)

    const glbBones: THREE.Bone[] = []
    viewmodelRoot.traverse((c) => {
      if ((c as THREE.Bone).isBone) glbBones.push(c as THREE.Bone)
    })

    const drawSeq = this.sequences.find((s) => s.label === 'draw')
    const restFrame = drawSeq ? Math.max(0, drawSeq.numFrames - 1) : 0
    const restTransforms = drawSeq ? calcBoneTransforms(model, drawSeq, restFrame) : null
    if (!restTransforms) return

    const tryBind = (mdlBoneName: string, glbKey: string): boolean => {
      const mdlIdx = model.bones.findIndex((b) => b.name === mdlBoneName)
      if (mdlIdx < 0) return false
      const bone = findGlbBone(glbBones, glbKey)
      if (!bone) return false
      this.binds.push({
        bone,
        mdlIndex: mdlIdx,
        glbRestQuat: bone.quaternion.clone(),
        mdlRestQuat: mdlQuat(restTransforms[mdlIdx]!),
      })
      return true
    }

    // Prefer explicit finger/hand bones when the GLB has them.
    for (let i = 0; i < model.bones.length; i++) {
      const key = mdlHandKey(model.bones[i]!.name)
      if (!key) continue
      const bone = findGlbBone(glbBones, key)
      if (!bone) continue
      this.binds.push({
        bone,
        mdlIndex: i,
        glbRestQuat: bone.quaternion.clone(),
        mdlRestQuat: mdlQuat(restTransforms[i]!),
      })
    }

    // M9 sketch packs usually only expose Root — drive it from MDL right hand.
    if (this.binds.length === 0) {
      tryBind('v_weapon.Bip01_R_Hand', 'Root') ||
        tryBind('v_weapon.Bip01_R_Forearm', 'Root')
    }
  }

  public get mappedBoneCount(): number {
    return this.binds.length
  }

  public applyFrames(seqIndex: number, frameA: number, _seqInfo: MDLSequenceInfo, blendT = 0): void {
    if (this.binds.length === 0) return
    const seq = this.sequences[seqIndex]
    if (!seq) return

    const f0 = Math.min(seq.numFrames - 1, Math.max(0, Math.floor(frameA)))
    const f1 = Math.min(seq.numFrames - 1, f0 + 1)
    const t = Math.min(1, Math.max(0, blendT))

    const transformsA = calcBoneTransforms(this.model, seq, f0)
    const transformsB = calcBoneTransforms(this.model, seq, f1)

    for (const bind of this.binds) {
      const qA = mdlQuat(transformsA[bind.mdlIndex]!)
      const qB = mdlQuat(transformsB[bind.mdlIndex]!)
      const nowQuat = qA.clone().slerp(qB, t)
      const deltaQuat = nowQuat.clone().multiply(bind.mdlRestQuat.clone().invert())
      bind.bone.quaternion.copy(bind.glbRestQuat).premultiply(deltaQuat)
    }

    this.viewRoot.traverse((c) => {
      const sk = c as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) sk.skeleton?.update()
    })
    this.viewRoot.updateMatrixWorld(true)
  }
}

export function createHandRetargeter(
  model: MDLModelData,
  viewmodelRoot: THREE.Object3D
): MDLHandRetargeter {
  return new MDLHandRetargeter(model, viewmodelRoot)
}

export function pauseViewmodelGlbMixer(fpsMesh: {
  mesh: THREE.Object3D
  mixer?: THREE.AnimationMixer
}): void {
  fpsMesh.mixer?.stopAllAction()
}
