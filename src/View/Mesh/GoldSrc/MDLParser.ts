import { MDLDataReader as R } from './MDLDataReader'
import type {
  MDLBodyPart,
  MDLBone,
  MDLBoneController,
  MDLHeader,
  MDLMeshStrip,
  MDLModelData,
  MDLSequence,
  MDLSeqGroup,
  MDLSubModel,
  MDLTexture,
} from './MDLTypes'

const MDL_MAGIC = 0x54534449
const MDL_VERSION = 10

function decodeTexture(data: Uint8Array, tex: Omit<MDLTexture, 'rgba' | 'texWidth' | 'texHeight'>): MDLTexture {
  const lg = (n: number) => Math.log(n) / Math.LN2
  const texWidth = Math.min(2 ** Math.ceil(lg(tex.width)), 512)
  const texHeight = Math.min(2 ** Math.ceil(lg(tex.height)), 512)
  const rgba = new Uint8Array(texWidth * texHeight * 4)
  const row1 = new Int32Array(512)
  const row2 = new Int32Array(512)
  const col1 = new Int32Array(512)
  const col2 = new Int32Array(512)

  for (let i = 0; i < texWidth; i++) {
    col1[i] = Math.floor(((i + 0.25) * tex.width) / texWidth)
    col2[i] = Math.floor(((i + 0.75) * tex.width) / texWidth)
  }
  for (let i = 0; i < texHeight; i++) {
    row1[i] = Math.floor((i + 0.25) * (tex.height / texHeight)) * tex.width
    row2[i] = Math.floor((i + 0.75) * (tex.height / texHeight)) * tex.width
  }

  const pal = tex.index + tex.width * tex.height
  let n = 0
  for (let y = 0; y < texHeight; y++) {
    for (let x = 0; x < texWidth; x++) {
      const sample = (row: number, col: number) => {
        const idx = data[tex.index + row + col]!
        return [
          data[pal + idx * 3]!,
          data[pal + idx * 3 + 1]!,
          data[pal + idx * 3 + 2]!,
        ] as const
      }
      const p1 = sample(row1[y]!, col1[x]!)
      const p2 = sample(row1[y]!, col2[x]!)
      const p3 = sample(row2[y]!, col1[x]!)
      const p4 = sample(row2[y]!, col2[x]!)
      rgba[n++] = (p1[0] + p2[0] + p3[0] + p4[0]) / 4
      rgba[n++] = (p1[1] + p2[1] + p3[1] + p4[1]) / 4
      rgba[n++] = (p1[2] + p2[2] + p3[2] + p4[2]) / 4
      rgba[n++] = 255
    }
  }

  return { ...tex, rgba, texWidth, texHeight }
}

function parseHeader(data: Uint8Array): MDLHeader {
  if (R.readInteger(data, 0) !== MDL_MAGIC) throw new Error('Invalid MDL magic')
  if (R.readInteger(data, 4) !== MDL_VERSION) throw new Error('Unsupported MDL version')

  return {
    name: R.readBinaryString(data, 8, 64),
    numBones: R.readInteger(data, 140),
    boneIndex: R.readInteger(data, 144),
    numBoneControllers: R.readInteger(data, 148),
    boneControllerIndex: R.readInteger(data, 152),
    numSeq: R.readInteger(data, 164),
    seqIndex: R.readInteger(data, 168),
    numSeqGroups: R.readInteger(data, 172),
    seqGroupIndex: R.readInteger(data, 176),
    numTextures: R.readInteger(data, 180),
    textureIndex: R.readInteger(data, 184),
    numSkinRef: R.readInteger(data, 192),
    skinIndex: R.readInteger(data, 200),
    numBodyParts: R.readInteger(data, 204),
    bodyPartIndex: R.readInteger(data, 208),
  }
}

function parseBones(data: Uint8Array, offset: number, num: number): MDLBone[] {
  const bones: MDLBone[] = []
  for (let i = offset; i < offset + num * 112; i += 112) {
    bones.push({
      name: R.readBinaryString(data, i, 32),
      parent: R.readInteger(data, i + 32),
      flags: R.readInteger(data, i + 36),
      boneController: [
        R.readInteger(data, i + 40),
        R.readInteger(data, i + 44),
        R.readInteger(data, i + 48),
        R.readInteger(data, i + 52),
        R.readInteger(data, i + 56),
        R.readInteger(data, i + 60),
      ],
      value: [
        R.readFloat(data, i + 64),
        R.readFloat(data, i + 68),
        R.readFloat(data, i + 72),
        R.readFloat(data, i + 76),
        R.readFloat(data, i + 80),
        R.readFloat(data, i + 84),
      ],
      scale: [
        R.readFloat(data, i + 88),
        R.readFloat(data, i + 92),
        R.readFloat(data, i + 96),
        R.readFloat(data, i + 100),
        R.readFloat(data, i + 104),
        R.readFloat(data, i + 108),
      ],
    })
  }
  return bones
}

function parseBoneControllers(data: Uint8Array, offset: number, num: number): MDLBoneController[] {
  const out: MDLBoneController[] = []
  for (let i = offset; i < offset + num * 24; i += 24) {
    out.push({
      bone: R.readInteger(data, i),
      type: R.readInteger(data, i + 4),
      start: R.readFloat(data, i + 8),
      end: R.readFloat(data, i + 12),
      rest: R.readInteger(data, i + 16),
      index: R.readInteger(data, i + 20),
    })
  }
  return out
}

function parseSequences(data: Uint8Array, offset: number, num: number): MDLSequence[] {
  const sequences: MDLSequence[] = []
  for (let i = offset; i < offset + num * 176; i += 176) {
    sequences.push({
      label: R.readBinaryString(data, i, 32),
      fps: R.readFloat(data, i + 32),
      flags: R.readInteger(data, i + 36),
      numFrames: R.readInteger(data, i + 56),
      animIndex: R.readInteger(data, i + 124),
      seqGroup: R.readInteger(data, i + 156),
      motionType: R.readInteger(data, i + 68),
      motionBone: R.readInteger(data, i + 72),
    })
  }
  return sequences
}

function parseSequenceGroups(data: Uint8Array, offset: number, num: number): MDLSeqGroup[] {
  const groups: MDLSeqGroup[] = []
  for (let i = offset; i < offset + num * 104; i += 104) {
    groups.push({
      label: R.readBinaryString(data, i, 32),
      name: R.readBinaryString(data, i + 32, 64),
      data: R.readInteger(data, i + 100),
    })
  }
  return groups
}

function parseTextures(data: Uint8Array, offset: number, num: number): MDLTexture[] {
  const textures: MDLTexture[] = []
  for (let i = offset; i < offset + num * 80; i += 80) {
    const base = {
      name: R.readBinaryString(data, i, 64),
      width: R.readInteger(data, i + 68),
      height: R.readInteger(data, i + 72),
      index: R.readInteger(data, i + 76),
    }
    textures.push(decodeTexture(data, base))
  }
  return textures
}

function parseBodyParts(data: Uint8Array, offset: number, num: number): MDLBodyPart[] {
  const parts: MDLBodyPart[] = []
  for (let i = offset; i < offset + num * 76; i += 76) {
    parts.push({
      name: R.readBinaryString(data, i, 64),
      numModels: R.readInteger(data, i + 64),
      base: R.readInteger(data, i + 68),
      modelIndex: R.readInteger(data, i + 72),
    })
  }
  return parts
}

function parseVec3s(data: Uint8Array, offset: number, numVec3: number): Float32Array {
  const vecs = new Float32Array(numVec3 * 3)
  for (let i = 0; i < numVec3; i++) {
    const o = offset + i * 12
    vecs[i * 3] = R.readFloat(data, o)
    vecs[i * 3 + 1] = R.readFloat(data, o + 4)
    vecs[i * 3 + 2] = R.readFloat(data, o + 8)
  }
  return vecs
}

function parseMesh(data: Uint8Array, offset: number, count: number): MDLMeshStrip[] {
  const mesh: MDLMeshStrip[] = []
  for (let i = offset; i < offset + count * 20; i += 20) {
    mesh.push({
      numTris: R.readInteger(data, i),
      triIndex: R.readInteger(data, i + 4),
      skinRef: R.readInteger(data, i + 8),
    })
  }
  return mesh
}

function parseModels(data: Uint8Array, offset: number, num: number): MDLSubModel[] {
  const models: MDLSubModel[] = []
  for (let i = offset; i < offset + num * 112; i += 112) {
    const numVerts = R.readInteger(data, i + 80)
    const vertInfoIndex = R.readInteger(data, i + 84)
    const vertIndex = R.readInteger(data, i + 88)
    const numMesh = R.readInteger(data, i + 72)
    const meshIndex = R.readInteger(data, i + 76)
    models.push({
      name: R.readBinaryString(data, i, 64),
      numVerts,
      numMesh,
      vertices: parseVec3s(data, vertIndex, numVerts),
      transformIndices: data.subarray(vertInfoIndex, vertInfoIndex + numVerts),
      mesh: parseMesh(data, meshIndex, numMesh),
    })
  }
  return models
}

export function parseGoldSrcMDL(buffer: ArrayBuffer): MDLModelData {
  const data = new Uint8Array(buffer)
  const header = parseHeader(data)
  const bones = parseBones(data, header.boneIndex, header.numBones)
  const boneControllers = parseBoneControllers(
    data,
    header.boneControllerIndex,
    header.numBoneControllers
  )
  const sequences = parseSequences(data, header.seqIndex, header.numSeq)
  const seqGroups = parseSequenceGroups(data, header.seqGroupIndex, header.numSeqGroups)
  const textures = parseTextures(data, header.textureIndex, header.numTextures)
  const bodyParts = parseBodyParts(data, header.bodyPartIndex, header.numBodyParts)
  const models: MDLSubModel[][] = []
  for (const part of bodyParts) {
    models.push(parseModels(data, part.modelIndex, part.numModels))
  }
  return {
    header,
    bones,
    boneControllers,
    sequences,
    seqGroups,
    textures,
    bodyParts,
    models,
    data,
  }
}
