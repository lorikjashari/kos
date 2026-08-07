import { MDLDataReader as R } from './MDLDataReader'
import type { MDLModelData, MDLSubModel } from './MDLTypes'

const TRIANGLE_FAN = 0
const TRIANGLE_STRIP = 1

export interface MDLFaceData {
  vertices: Float32Array
  uv: Float32Array
  /** Original MDL vertex index per rendered vertex (for bone lookup). */
  vertIndices: Int16Array
}

/**
 * Unpack GoldSrc strip/fan mesh data (ported from web-hlmv geometryBuilder.ts).
 * @see https://github.com/danakt/web-hlmv
 */
export function readFacesData(
  data: Uint8Array,
  triIndex: number,
  sub: MDLSubModel,
  texW: number,
  texH: number
): MDLFaceData {
  const verticesData: number[][] = []
  let trisPos = triIndex

  while (true) {
    const head = R.readSignedShort(data, trisPos)
    if (head === 0) break

    const trianglesType = head < 0 ? TRIANGLE_FAN : TRIANGLE_STRIP
    let trianglesNum = Math.abs(head)
    trisPos += 2

    let startVert: number[] | null = null

    for (let j = 0; j < trianglesNum; j++) {
      const vertIndex = R.readSignedShort(data, trisPos)
      const s = R.readSignedShort(data, trisPos + 4)
      const t = R.readSignedShort(data, trisPos + 6)
      trisPos += 8

      const vertexData = [
        sub.vertices[vertIndex * 3]!,
        sub.vertices[vertIndex * 3 + 1]!,
        sub.vertices[vertIndex * 3 + 2]!,
        s / texW,
        1 - t / texH,
        vertIndex,
      ]

      if (trianglesType === TRIANGLE_STRIP) {
        if (j > 2) {
          if (j % 2 === 0) {
            verticesData.push(verticesData[verticesData.length - 3]!, verticesData[verticesData.length - 1]!)
          } else {
            verticesData.push(verticesData[verticesData.length - 1]!, verticesData[verticesData.length - 2]!)
          }
        }
      }

      if (trianglesType === TRIANGLE_FAN) {
        startVert = startVert ?? vertexData
        if (j > 2) {
          verticesData.push(startVert, verticesData[verticesData.length - 1]!)
        }
      }

      verticesData.push(vertexData)
    }
  }

  const vertCount = verticesData.length
  const vertices = new Float32Array(vertCount * 3)
  const uv = new Float32Array(vertCount * 2)
  const vertIndices = new Int16Array(vertCount)

  for (let i = 0; i < vertCount; i++) {
    const v = verticesData[i]!
    vertices[i * 3] = v[0]!
    vertices[i * 3 + 1] = v[1]!
    vertices[i * 3 + 2] = v[2]!
    uv[i * 2] = v[3]!
    uv[i * 2 + 1] = v[4]!
    vertIndices[i] = v[5]!
  }

  return { vertices, uv, vertIndices }
}

/** CPU skinning — transforms bind-pose vertices by bone world matrices. */
export function applyBoneTransforms(
  vertices: Float32Array,
  vertIndices: Int16Array,
  vertBoneBuffer: Uint8Array,
  boneTransforms: Float32Array[]
): Float32Array {
  const out = new Float32Array(vertices.length)

  for (let i = 0; i < vertIndices.length; i++) {
    const bone = vertBoneBuffer[vertIndices[i]!]!
    const m = boneTransforms[bone]!

    const x = vertices[i * 3]!
    const y = vertices[i * 3 + 1]!
    const z = vertices[i * 3 + 2]!
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]! || 1

    out[i * 3] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w
    out[i * 3 + 1] = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w
    out[i * 3 + 2] = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w
  }

  return out
}

export function resolveSkinTextureIndex(model: MDLModelData, skinRef: number): number {
  return R.readSignedShort(model.data, model.header.skinIndex + 2 * skinRef)
}
