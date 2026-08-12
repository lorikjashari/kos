import * as THREE from 'three'
import { MDLDataReader as R } from './MDLDataReader'
import type { MDLBone, MDLModelData, MDLSequence } from './MDLTypes'

const STUDIO_X = 0x0001
const STUDIO_Y = 0x0002
const STUDIO_Z = 0x0004
const STUDIO_XR = 0x0008
const STUDIO_YR = 0x0010
const STUDIO_ZR = 0x0020
const STUDIO_TYPES = 0x7fff
const STUDIO_RLOOP = 0x8000

/** GoldSrc Euler → quaternion (web-hlmv geometryTransformer.anglesToQuaternion). */
export function anglesToQuaternion(pitch: number, roll: number, yaw: number): THREE.Quaternion {
  const cy = Math.cos(yaw * 0.5)
  const sy = Math.sin(yaw * 0.5)
  const cp = Math.cos(roll * 0.5)
  const sp = Math.sin(roll * 0.5)
  const cr = Math.cos(pitch * 0.5)
  const sr = Math.sin(pitch * 0.5)

  return new THREE.Quaternion(
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy
  )
}

function animValue(data: Uint8Array, base: number, index: number): number {
  return R.readSignedShort(data, base + 2 * index)
}

function animValid(data: Uint8Array, base: number, index: number): number {
  return data[base + 2 * index]!
}

function animTotal(data: Uint8Array, base: number, index: number): number {
  return data[base + 2 * index + 1]!
}

function getAnimation(model: MDLModelData, sequence: MDLSequence, boneIndex: number) {
  const index = sequence.animIndex + boneIndex * 12
  const d = model.data
  return {
    base: index,
    offset: [
      d[index]! + (d[index + 1]! << 8),
      d[index + 2]! + (d[index + 3]! << 8),
      d[index + 4]! + (d[index + 5]! << 8),
      d[index + 6]! + (d[index + 7]! << 8),
      d[index + 8]! + (d[index + 9]! << 8),
      d[index + 10]! + (d[index + 11]! << 8),
    ],
  }
}

function calcBoneAdj(model: MDLModelData): number[] {
  const adj = new Array(model.boneControllers.length).fill(0)
  for (let j = 0; j < model.boneControllers.length; j++) {
    const bc = model.boneControllers[j]!
    const i = bc.index
    let value = bc.start
    if (i <= 3 && bc.type & STUDIO_RLOOP) value = bc.start
    switch (bc.type & STUDIO_TYPES) {
      case STUDIO_XR:
      case STUDIO_YR:
      case STUDIO_ZR:
        adj[j] = value * (Math.PI / 180)
        break
      case STUDIO_X:
      case STUDIO_Y:
      case STUDIO_Z:
        adj[j] = value
        break
    }
  }
  return adj
}

function calcBoneQuaternion(
  data: Uint8Array,
  frame: number,
  s: number,
  bone: MDLBone,
  animation: ReturnType<typeof getAnimation>,
  adj: number[]
): THREE.Quaternion {
  const angle1 = [0, 0, 0]
  const angle2 = [0, 0, 0]

  for (let j = 0; j < 3; j++) {
    if (animation.offset[j + 3] === 0) {
      angle1[j] = bone.value[j + 3]!
      angle2[j] = angle1[j]!
    } else {
      let animIndex = animation.base + animation.offset[j + 3]!
      let k = Math.floor(frame)
      while (animTotal(data, animIndex, 0) <= k) {
        k -= animTotal(data, animIndex, 0)
        animIndex += 2 * animValid(data, animIndex, 0) + 2
      }
      if (animValid(data, animIndex, 0) > k) {
        angle1[j] = animValue(data, animIndex, k + 1)
        angle2[j] =
          animValid(data, animIndex, 0) > k + 1
            ? animValue(data, animIndex, k + 2)
            : animTotal(data, animIndex, 0) > k + 1
              ? angle1[j]!
              : animValue(data, animIndex, animValid(data, animIndex, 0) + 2)
      } else {
        angle1[j] = animValue(data, animIndex, animValid(data, animIndex, 0))
        angle2[j] =
          animTotal(data, animIndex, 0) > k + 1
            ? angle1[j]!
            : animValue(data, animIndex, animValid(data, animIndex, 0) + 2)
      }
      angle1[j] = bone.value[j + 3]! + angle1[j]! * bone.scale[j + 3]!
      angle2[j] = bone.value[j + 3]! + angle2[j]! * bone.scale[j + 3]!
    }
    if (bone.boneController[j + 3]! !== -1) {
      angle1[j] += adj[bone.boneController[j + 3]!]!
      angle2[j] += adj[bone.boneController[j + 3]!]!
    }
  }

  const q1 = anglesToQuaternion(angle1[0]!, angle1[1]!, angle1[2]!)
  const q2 = anglesToQuaternion(angle2[0]!, angle2[1]!, angle2[2]!)

  if (
    Math.abs(angle1[0]! - angle2[0]!) +
      Math.abs(angle1[1]! - angle2[1]!) +
      Math.abs(angle1[2]! - angle2[2]!) <
    0.001
  ) {
    return q1
  }
  return q1.slerp(q2, s)
}

function calcBonePosition(bone: MDLBone): THREE.Vector3 {
  return new THREE.Vector3(bone.value[0]!, bone.value[1]!, bone.value[2]!)
}

/** Local rotation for one MDL bone at a sequence frame. */
export function calcLocalBoneQuaternion(
  model: MDLModelData,
  sequence: MDLSequence,
  frame: number,
  boneIndex: number
): THREE.Quaternion {
  const bone = model.bones[boneIndex]!
  const animation = getAnimation(model, sequence, boneIndex)
  const adj = calcBoneAdj(model)
  const s = frame - Math.floor(frame)
  return calcBoneQuaternion(model.data, frame, s, bone, animation, adj)
}

const _weaponRelScratch = {
  weaponInv: new THREE.Matrix4(),
  rel: new THREE.Matrix4(),
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
}

/** Hand / forearm orientation relative to the MDL v_weapon root bone. */
export function calcBoneQuatRelativeToWeapon(
  transforms: Float32Array[],
  weaponIndex: number,
  boneIndex: number
): THREE.Quaternion {
  _weaponRelScratch.weaponInv.fromArray(transforms[weaponIndex]!).invert()
  _weaponRelScratch.rel.fromArray(transforms[boneIndex]!)
  _weaponRelScratch.rel.premultiply(_weaponRelScratch.weaponInv)
  _weaponRelScratch.rel.decompose(
    _weaponRelScratch.pos,
    _weaponRelScratch.quat,
    _weaponRelScratch.scale
  )
  return _weaponRelScratch.quat.clone()
}

/** World-space bone matrices for one animation frame (web-hlmv calcBoneTransforms). */
export function calcBoneTransforms(model: MDLModelData, sequence: MDLSequence, frame: number): Float32Array[] {
  const adj = calcBoneAdj(model)
  const s = frame - Math.floor(frame)
  const transforms: Float32Array[] = []

  for (let i = 0; i < model.bones.length; i++) {
    const bone = model.bones[i]!
    const animation = getAnimation(model, sequence, i)
    const q = calcBoneQuaternion(model.data, frame, s, bone, animation, adj)
    const p = calcBonePosition(bone)

    const boneMatrix = new THREE.Matrix4().makeRotationFromQuaternion(q)
    boneMatrix.setPosition(p)

    if (bone.parent === -1) {
      transforms.push(boneMatrix.toArray() as unknown as Float32Array)
    } else {
      const world = new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().fromArray(transforms[bone.parent]!),
        boneMatrix
      )
      transforms.push(world.toArray() as unknown as Float32Array)
    }
  }

  return transforms
}
