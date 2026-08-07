import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildGoldSrcMDLScene } from '../src/View/Mesh/GoldSrc/loadGoldSrcMDL.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buf = fs.readFileSync(path.join(__dirname, '../public/models/butterfly_knife.mdl'))
const { parts, sequences, root } = buildGoldSrcMDLScene(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

const drawIdx = sequences.findIndex((s) => s.label === 'draw')
parts.forEach((p, i) => {
  for (const frame of [0, 23]) {
    const pos = p.framePositions[drawIdx]?.[frame]
    if (!pos) return
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let j = 0; j < pos.length; j += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], pos[j + c]!)
        max[c] = Math.max(max[c], pos[j + c]!)
      }
    }
    const center = min.map((m, k) => (m + max[k]!) / 2)
    console.log('part', i, 'f' + frame, 'center', center.map((x) => x.toFixed(1)).join(','))
  }
})

console.log('scale on root:', 0.0032)

for (const frame of [0, 23]) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    const pos = part.framePositions[drawIdx]?.[frame]
    if (!pos) continue
    for (let i = 0; i < pos.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], pos[i + c]!)
        max[c] = Math.max(max[c], pos[i + c]!)
      }
    }
  }
  const center = min.map((m, i) => (m + max[i]!) / 2)
  const size = max.map((m, i) => m - min[i]!)
  console.log(`draw f${frame} raw bbox center`, center.map((x) => x.toFixed(2)), 'size', size.map((x) => x.toFixed(2)))
  console.log(`  scaled size`, size.map((x) => (x * 0.0032).toFixed(4)))
}

// After orient rot x=-90 z=-90, typical GoldSrc -> Three mapping
import * as THREE from 'three'
root.updateMatrixWorld(true)
const box = new THREE.Box3().setFromObject(root)
console.log('three world bbox', box.min.toArray().map(x=>x.toFixed(4)), box.max.toArray().map(x=>x.toFixed(4)))
console.log('three size', box.getSize(new THREE.Vector3()).toArray().map(x=>x.toFixed(4)))
