import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { packedPositions } from './PackedPositions'

/** Position + normal + uv sharing one buffer, exactly how glTF ships map meshes. */
function interleavedGeometry(triples: number[][]): THREE.BufferGeometry {
  const stride = 8
  const data = new Float32Array(triples.length * stride)
  triples.forEach(([x, y, z], i) => {
    data[i * stride] = x
    data[i * stride + 1] = y
    data[i * stride + 2] = z
    // normal
    data[i * stride + 3] = 0
    data[i * stride + 4] = 1
    data[i * stride + 5] = 0
    // uv
    data[i * stride + 6] = 0.5
    data[i * stride + 7] = 0.25
  })
  const buffer = new THREE.InterleavedBuffer(data, stride)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0))
  return geometry
}

describe('packedPositions', () => {
  it('passes through an already packed attribute without copying', () => {
    const array = new Float32Array([1, 2, 3, 4, 5, 6])
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3))
    expect(packedPositions(geometry)).toBe(array)
  })

  it('de-interleaves positions shared with normals and uvs', () => {
    const geometry = interleavedGeometry([
      [1, 2, 3],
      [4, 5, 6],
      [-7, -8, -9],
    ])
    expect(Array.from(packedPositions(geometry))).toEqual([1, 2, 3, 4, 5, 6, -7, -8, -9])
  })

  it('keeps triangle lookups by index correct on interleaved data', () => {
    const geometry = interleavedGeometry([
      [0, 0, 0],
      [10, 0, 0],
      [0, 0, 10],
    ])
    const vertices = packedPositions(geometry)
    // The collider strides by 3 per index; on the raw interleaved array vertex 2
    // would land in the first vertex's normal instead of its own position.
    const third = [vertices[2 * 3], vertices[2 * 3 + 1], vertices[2 * 3 + 2]]
    expect(third).toEqual([0, 0, 10])
  })
})
