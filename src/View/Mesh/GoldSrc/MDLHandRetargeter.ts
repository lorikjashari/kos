import * as THREE from 'three'
import { calcBoneTransforms } from './MDLRig'
import type { MDLModelData, MDLSequence } from './MDLTypes'
import type { MDLSequenceInfo } from './loadGoldSrcMDL'

/** GoldSrc viewmodel axis → Three.js (matches MDL knife orient). */
const GOLD_TO_THREE = new THREE.Matrix4().makeRotationFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2, 'XYZ')
)
const THREE_TO_GOLD = GOLD_TO_THREE.clone().invert()

/** MDL studiomdl units → M9 GLB armature scale. */
const MDL_POS_SCALE = 0.00185

type BoneBind = {
  bone: THREE.Bone
  mdlIndex: number
  glbRestPos: THREE.Vector3
  glbRestQuat: THREE.Quaternion
  glbRestScale: THREE.Vector3
  mdlRestPos: THREE.Vector3
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

function convertMdlWorld(m: THREE.Matrix4): THREE.Matrix4 {
  return GOLD_TO_THREE.clone().multiply(m).multiply(THREE_TO_GOLD)
}

function decomposeMdlTransform(arr: Float32Array): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const m = convertMdlWorld(new THREE.Matrix4().fromArray(arr))
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  m.decompose(pos, quat, scl)
  return { pos, quat }
}

/**
 * Drive M9 GLB hand bones from CS MDL cshands skeleton (draw / midslash / …).
 * Knife mesh stays on the separate MDL prop; only Bip01 chains are retargeted.
 */
export class MDLHandRetargeter {
  private readonly model: MDLModelData
  private readonly sequences: MDLSequence[]
  private readonly binds: BoneBind[] = []
  private readonly armature: THREE.Object3D

  constructor(model: MDLModelData, viewmodelRoot: THREE.Object3D) {
    this.model = model
    this.sequences = model.sequences.filter((s) => s.numFrames > 0)

    let armature: THREE.Object3D | undefined = viewmodelRoot.getObjectByName('Armature') ?? undefined
    if (!armature) {
      viewmodelRoot.traverse((c) => {
        if (!armature && c.name === 'Armature') armature = c
      })
    }
    this.armature = armature ?? viewmodelRoot

    const glbBones: THREE.Bone[] = []
    viewmodelRoot.traverse((c) => {
      if ((c as THREE.Bone).isBone) glbBones.push(c as THREE.Bone)
    })

    const drawSeq = this.sequences.find((s) => s.label === 'draw')
    const restFrame = drawSeq ? Math.max(0, drawSeq.numFrames - 1) : 0
    const restTransforms = drawSeq ? calcBoneTransforms(model, drawSeq, restFrame) : null

    for (let i = 0; i < model.bones.length; i++) {
      const key = mdlHandKey(model.bones[i]!.name)
      if (!key || !restTransforms) continue
      const bone = findGlbBone(glbBones, key)
      if (!bone) continue

      const glbRestPos = new THREE.Vector3()
      const glbRestQuat = new THREE.Quaternion()
      const glbRestScale = new THREE.Vector3()
      bone.matrix.decompose(glbRestPos, glbRestQuat, glbRestScale)

      const { pos: mdlRestPos, quat: mdlRestQuat } = decomposeMdlTransform(restTransforms[i]!)

      this.binds.push({
        bone,
        mdlIndex: i,
        glbRestPos,
        glbRestQuat,
        glbRestScale,
        mdlRestPos,
        mdlRestQuat,
      })
    }

    if (this.binds.length === 0 && restTransforms) {
      const root =
        findGlbBone(glbBones, 'Root') ??
        glbBones.find((b) => b.name === 'Root' || b.parent?.name === 'Armature')
      const forearmIdx = model.bones.findIndex((b) => b.name === 'v_weapon.Bip01_R_Forearm')
      if (root && forearmIdx >= 0) {
        const glbRestPos = new THREE.Vector3()
        const glbRestQuat = new THREE.Quaternion()
        const glbRestScale = new THREE.Vector3()
        root.matrix.decompose(glbRestPos, glbRestQuat, glbRestScale)
        const { pos: mdlRestPos, quat: mdlRestQuat } = decomposeMdlTransform(
          restTransforms[forearmIdx]!
        )
        this.binds.push({
          bone: root,
          mdlIndex: forearmIdx,
          glbRestPos,
          glbRestQuat,
          glbRestScale,
          mdlRestPos,
          mdlRestQuat,
        })
      }
    }
  }

  public get mappedBoneCount(): number {
    return this.binds.length
  }

  /** Apply MDL sequence frame (optionally blended) to mapped GLB bones. */
  public applyFrames(seqIndex: number, frameA: number, seqInfo: MDLSequenceInfo, blendT = 0): void {
    if (this.binds.length === 0) return
    const seq = this.sequences[seqIndex]
    if (!seq) return

    const f0 = Math.min(seq.numFrames - 1, Math.max(0, Math.floor(frameA)))
    const f1 = Math.min(seq.numFrames - 1, f0 + 1)
    const t = Math.min(1, Math.max(0, blendT))

    const transformsA = calcBoneTransforms(this.model, seq, f0)
    const transformsB = calcBoneTransforms(this.model, seq, f1)

    for (const bind of this.binds) {
      const nowA = decomposeMdlTransform(transformsA[bind.mdlIndex]!)
      const nowB = decomposeMdlTransform(transformsB[bind.mdlIndex]!)

      const nowPos = nowA.pos.clone().lerp(nowB.pos, t)
      const nowQuat = nowA.quat.clone().slerp(nowB.quat, t)

      const deltaQuat = nowQuat.clone().multiply(bind.mdlRestQuat.clone().invert())
      const deltaPos = nowPos.clone().sub(bind.mdlRestPos).multiplyScalar(MDL_POS_SCALE)

      bind.bone.quaternion.copy(bind.glbRestQuat).premultiply(deltaQuat)
      bind.bone.position.copy(bind.glbRestPos).add(
        deltaPos.applyQuaternion(bind.glbRestQuat.clone().invert())
      )
      bind.bone.scale.copy(bind.glbRestScale)
    }

    this.updateSkeletons(this.armature)
  }

  public applySequenceTime(seqIndex: number, timeSec: number, seqInfo: MDLSequenceInfo): void {
    const raw = timeSec * seqInfo.fps
    const f0 = Math.floor(raw)
    const t = raw - f0
    this.applyFrames(seqIndex, f0, seqInfo, t)
  }

  private updateSkeletons(root: THREE.Object3D): void {
    root.traverse((c) => {
      const sk = c as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) sk.skeleton?.update()
    })
    root.updateMatrixWorld(true)
  }
}

export function createHandRetargeter(
  model: MDLModelData,
  viewmodelRoot: THREE.Object3D
): MDLHandRetargeter {
  return new MDLHandRetargeter(model, viewmodelRoot)
}

/** Stop GLB clip actions so manual bone poses are not overwritten. */
export function pauseViewmodelGlbMixer(fpsMesh: { mesh: THREE.Object3D; mixer?: THREE.AnimationMixer }): void {
  fpsMesh.mixer?.stopAllAction()
}
