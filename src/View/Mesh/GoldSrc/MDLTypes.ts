export interface MDLHeader {
  name: string
  numBones: number
  boneIndex: number
  numBoneControllers: number
  boneControllerIndex: number
  numSeq: number
  seqIndex: number
  numSeqGroups: number
  seqGroupIndex: number
  numTextures: number
  textureIndex: number
  numSkinRef: number
  skinIndex: number
  numBodyParts: number
  bodyPartIndex: number
}

export interface MDLBone {
  name: string
  parent: number
  flags: number
  boneController: number[]
  value: number[]
  scale: number[]
}

export interface MDLBoneController {
  bone: number
  type: number
  start: number
  end: number
  rest: number
  index: number
}

export interface MDLSequence {
  label: string
  fps: number
  flags: number
  numFrames: number
  animIndex: number
  seqGroup: number
  motionType: number
  motionBone: number
}

export interface MDLSeqGroup {
  label: string
  name: string
  data: number
}

export interface MDLTexture {
  name: string
  width: number
  height: number
  index: number
  rgba: Uint8Array
  texWidth: number
  texHeight: number
}

export interface MDLMeshStrip {
  numTris: number
  triIndex: number
  skinRef: number
}

export interface MDLSubModel {
  name: string
  numVerts: number
  numMesh: number
  vertices: Float32Array
  transformIndices: Uint8Array
  mesh: MDLMeshStrip[]
}

export interface MDLBodyPart {
  name: string
  numModels: number
  base: number
  modelIndex: number
}

export interface MDLModelData {
  header: MDLHeader
  bones: MDLBone[]
  boneControllers: MDLBoneController[]
  sequences: MDLSequence[]
  seqGroups: MDLSeqGroup[]
  textures: MDLTexture[]
  bodyParts: MDLBodyPart[]
  models: MDLSubModel[][]
  data: Uint8Array
}
