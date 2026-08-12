import * as THREE from 'three'
import { parseGoldSrcMDL } from './MDLParser'
import { applyBoneTransforms, readFacesData, resolveSkinTextureIndex } from './MDLGeometry'
import { calcBoneTransforms } from './MDLRig'
import type { MDLModelData, MDLSequence, MDLSubModel } from './MDLTypes'

export interface MDLSequenceInfo {
  label: string
  fps: number
  numFrames: number
  duration: number
}

export interface MDLMeshPart {
  mesh: THREE.Mesh
  /** [sequenceIndex][frame] → skinned vertex positions */
  framePositions: Float32Array[][]
}

export interface MDLViewmodel {
  root: THREE.Group
  sequences: MDLSequenceInfo[]
  parts: MDLMeshPart[]
  restSeqIndex: number
  restFrame: number
  /** Dummy clips so findClip() works — duration only, no tracks. */
  animations: THREE.AnimationClip[]
}

const REST_CLIP = 'draw'
/** Full v_knife viewmodel (hands + knife) — unused when compositing onto M9 hands. */
const VIEWMODEL_TARGET_SIZE = 0.38
/** Knife-only prop seated on GLB hands. */
const KNIFE_PROP_TARGET_SIZE = 0.15

function textureFromMDL(tex: MDLModelData['textures'][0]): THREE.Texture {
  const map = new THREE.DataTexture(tex.rgba, tex.texWidth, tex.texHeight, THREE.RGBAFormat)
  map.needsUpdate = true
  map.flipY = true
  map.colorSpace = THREE.SRGBColorSpace
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearFilter
  return map
}

/** FPS knife prop — lit + Doppler-style blue lift (BasicMaterial reads flat black). */
export function knifePropMaterialFromMDL(tex: MDLModelData['textures'][0]): THREE.MeshStandardMaterial {
  const map = textureFromMDL(tex)
  return new THREE.MeshStandardMaterial({
    map,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.45,
    metalness: 0.5,
    roughness: 0.34,
    color: new THREE.Color(1.32, 1.36, 1.52),
    emissive: new THREE.Color(0.14, 0.22, 0.72),
    emissiveIntensity: 0.42,
  })
}

type MDLMaterialFactory = (tex: MDLModelData['textures'][0]) => THREE.Material

function pickBodyModel(partModels: MDLSubModel[]): MDLSubModel {
  return partModels[0]!
}

function isKnifeBodyPart(sub: MDLSubModel): boolean {
  const n = sub.name.toLowerCase()
  return !n.includes('cshands') && !n.includes('hand')
}

function isCshandsBodyPart(sub: MDLSubModel): boolean {
  return sub.name.toLowerCase().includes('cshands')
}

function bakePartFrames(
  model: MDLModelData,
  bindVerts: Float32Array,
  vertIndices: Int16Array,
  vertBoneBuffer: Uint8Array,
  sequences: MDLSequence[]
): Float32Array[][] {
  return sequences.map((seq) => {
    const frames: Float32Array[] = []
    for (let f = 0; f < seq.numFrames; f++) {
      const boneTransforms = calcBoneTransforms(model, seq, f)
      frames.push(applyBoneTransforms(bindVerts, vertIndices, vertBoneBuffer, boneTransforms))
    }
    return frames
  })
}

function applyFrameToParts(parts: MDLMeshPart[], seqIndex: number, frame: number): void {
  for (const part of parts) {
    const positions = part.framePositions[seqIndex]?.[frame]
    if (!positions) continue
    const attr = part.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(positions)
    attr.needsUpdate = true
  }
}

function fitPartsToTarget(
  root: THREE.Group,
  orient: THREE.Group,
  parts: MDLMeshPart[],
  restSeqIndex: number,
  restFrame: number,
  targetSize: number
): void {
  applyFrameToParts(parts, restSeqIndex, restFrame)

  root.scale.setScalar(1)
  orient.position.set(0, 0, 0)
  root.updateMatrixWorld(true)

  const box = new THREE.Box3()
  for (const part of parts) box.expandByObject(part.mesh)

  const center = box.getCenter(new THREE.Vector3())
  root.worldToLocal(center)
  orient.position.copy(center.negate())

  root.updateMatrixWorld(true)
  box.makeEmpty()
  for (const part of parts) box.expandByObject(part.mesh)

  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.001)
  root.scale.setScalar(targetSize / maxDim)
}

/** Bake fit centering + scale into vertex data so frame playback stays in local space. */
function bakeFitIntoFramePositions(
  parts: MDLMeshPart[],
  orient: THREE.Group,
  root: THREE.Group
): void {
  const ox = orient.position.x
  const oy = orient.position.y
  const oz = orient.position.z
  const sc = root.scale.x

  for (const part of parts) {
    for (const seqFrames of part.framePositions) {
      for (const frame of seqFrames) {
        for (let i = 0; i < frame.length; i += 3) {
          frame[i] = (frame[i]! + ox) * sc
          frame[i + 1] = (frame[i + 1]! + oy) * sc
          frame[i + 2] = (frame[i + 2]! + oz) * sc
        }
      }
    }

    const attr = part.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = (arr[i]! + ox) * sc
      arr[i + 1] = (arr[i + 1]! + oy) * sc
      arr[i + 2] = (arr[i + 2]! + oz) * sc
    }
    attr.needsUpdate = true
  }

  orient.position.set(0, 0, 0)
  root.scale.setScalar(1)
}

function buildScene(
  buffer: ArrayBuffer,
  includePart: (sub: MDLSubModel) => boolean,
  targetSize: number,
  createMaterial?: MDLMaterialFactory
): MDLViewmodel {
  const model = parseGoldSrcMDL(buffer)

  const root = new THREE.Group()
  root.name = model.header.name

  const orient = new THREE.Group()
  orient.name = 'GoldSrcOrient'
  orient.rotation.x = -Math.PI / 2
  orient.rotation.z = -Math.PI / 2
  root.add(orient)

  const sequences = model.sequences.filter((s) => s.numFrames > 0)
  const sequenceInfos: MDLSequenceInfo[] = sequences.map((s) => ({
    label: s.label,
    fps: Math.max(1, s.fps),
    numFrames: s.numFrames,
    duration: Math.max(0.05, s.numFrames / Math.max(1, s.fps)),
  }))

  const restSeqIndex = Math.max(0, sequences.findIndex((s) => s.label === REST_CLIP))
  const restFrame = Math.max(0, (sequences[restSeqIndex]?.numFrames ?? 1) - 1)

  const parts: MDLMeshPart[] = []

  for (let pi = 0; pi < model.bodyParts.length; pi++) {
    const sub = pickBodyModel(model.models[pi]!)
    if (!includePart(sub)) continue

    for (const strip of sub.mesh) {
      const texIdx = resolveSkinTextureIndex(model, strip.skinRef)
      const tex = model.textures[texIdx] ?? model.textures[0]!
      const { vertices, uv, vertIndices } = readFacesData(model.data, strip.triIndex, sub, tex.width, tex.height)

      if (vertices.length === 0) continue

      const framePositions = bakePartFrames(model, vertices, vertIndices, sub.transformIndices, sequences)

      const restPositions = framePositions[restSeqIndex]?.[restFrame] ?? framePositions[0]?.[0]!
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(restPositions.slice(), 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv.slice(), 2))
      geometry.computeVertexNormals()

      const material = createMaterial
        ? createMaterial(tex)
        : new THREE.MeshBasicMaterial({
            map: textureFromMDL(tex),
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.5,
          })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.frustumCulled = false
      orient.add(mesh)
      parts.push({ mesh, framePositions })
    }
  }

  fitPartsToTarget(root, orient, parts, restSeqIndex, restFrame, targetSize)
  bakeFitIntoFramePositions(parts, orient, root)

  const animations = sequenceInfos.map((s) => new THREE.AnimationClip(s.label, s.duration, []))

  return { root, sequences: sequenceInfos, parts, restSeqIndex, restFrame, animations }
}

/** Knife mesh only — for seating on existing FPS GLB hands. */
export function buildGoldSrcKnifeProp(buffer: ArrayBuffer): MDLViewmodel {
  return buildScene(buffer, isKnifeBodyPart, KNIFE_PROP_TARGET_SIZE, knifePropMaterialFromMDL)
}

/** CS knife + cshands from butterfly_knife.mdl — exact in-game CS 1.6 animation. */
export function buildGoldSrcButterflyAnimProp(buffer: ArrayBuffer): MDLViewmodel {
  return buildScene(
    buffer,
    (sub) => isKnifeBodyPart(sub) || isCshandsBodyPart(sub),
    VIEWMODEL_TARGET_SIZE,
    knifePropMaterialFromMDL
  )
}

/** Full v_knife viewmodel — CS hands (cshands) + knife, single baked rig. */
export function buildGoldSrcButterflyViewmodel(buffer: ArrayBuffer): MDLViewmodel {
  return buildScene(buffer, () => true, VIEWMODEL_TARGET_SIZE, knifePropMaterialFromMDL)
}

export function buildGoldSrcMDLScene(buffer: ArrayBuffer): MDLViewmodel {
  return buildScene(buffer, () => true, VIEWMODEL_TARGET_SIZE)
}

export async function loadGoldSrcKnifeProp(path: string): Promise<MDLViewmodel> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Failed to load MDL: ${path}`)
  return buildGoldSrcKnifeProp(await response.arrayBuffer())
}

export async function loadGoldSrcButterflyViewmodel(path: string): Promise<MDLViewmodel> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Failed to load MDL: ${path}`)
  return buildGoldSrcButterflyViewmodel(await response.arrayBuffer())
}

export async function loadGoldSrcMDL(path: string): Promise<MDLViewmodel> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Failed to load MDL: ${path}`)
  return buildGoldSrcMDLScene(await response.arrayBuffer())
}
