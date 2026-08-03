import * as THREE from "three";

type PositionAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/**
 * Vertex positions as a tightly packed [x, y, z, x, y, z, ...] array.
 *
 * glTF is free to interleave position with normals and UVs inside one shared
 * buffer view, and three.js surfaces that as an InterleavedBufferAttribute
 * whose `.array` is the *whole* interleaved block. Striding such an array by 3
 * walks straight into the neighbouring attributes and yields a scrambled mesh,
 * so anything that wants raw coordinates has to go through the accessor.
 */
export function packedPositions(geometry: THREE.BufferGeometry): ArrayLike<number> {
  const attribute = geometry.getAttribute("position") as PositionAttribute;
  const interleaved = (attribute as THREE.InterleavedBufferAttribute)
    .isInterleavedBufferAttribute;
  if (!interleaved && attribute.itemSize === 3) return attribute.array;

  const packed = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    packed[i * 3] = attribute.getX(i);
    packed[i * 3 + 1] = attribute.getY(i);
    packed[i * 3 + 2] = attribute.getZ(i);
  }
  return packed;
}
