import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mdlPath = path.join(__dirname, '../public/models/butterfly_knife.mdl')

// Minimal inline reader (mirrors MDLDataReader)
const readInteger = (d, o) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)
const readFloat = (d, o) => new DataView(d.buffer, d.byteOffset, d.byteLength).getFloat32(o, true)
const readBinaryString = (d, o, len) => {
  let s = ''
  for (let i = 0; i < len; i++) {
    const c = d[o + i]
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function parseVec3s(data, offset, numVec3) {
  const vecs = new Float32Array(numVec3 * 3)
  for (let i = 0; i < numVec3; i++) {
    const o = offset + i * 12
    vecs[i * 3] = readFloat(data, o)
    vecs[i * 3 + 1] = readFloat(data, o + 4)
    vecs[i * 3 + 2] = readFloat(data, o + 8)
  }
  return vecs
}

function parseModels(data, offset, num) {
  const models = []
  for (let i = offset; i < offset + num * 112; i += 112) {
    const numVerts = readInteger(data, i + 80)
    const vertInfoIndex = readInteger(data, i + 84)
    const vertIndex = readInteger(data, i + 88)
    models.push({
      name: readBinaryString(data, i, 64),
      numVerts,
      vertices: parseVec3s(data, vertIndex, numVerts),
      transformIndices: data.subarray(vertInfoIndex, vertInfoIndex + numVerts),
    })
  }
  return models
}

const buf = fs.readFileSync(mdlPath)
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)

const numBodyParts = readInteger(data, 204)
const bodyPartIndex = readInteger(data, 208)

console.log('MDL:', readBinaryString(data, 8, 64))
console.log('Body parts:', numBodyParts)

let globalMin = [Infinity, Infinity, Infinity]
let globalMax = [-Infinity, -Infinity, -Infinity]
let totalVerts = 0

for (let p = 0; p < numBodyParts; p++) {
  const bpOff = bodyPartIndex + p * 76
  const partName = readBinaryString(data, bpOff, 64)
  const numModels = readInteger(data, bpOff + 64)
  const modelIndex = readInteger(data, bpOff + 72)
  const models = parseModels(data, modelIndex, numModels)

  for (const m of models) {
    totalVerts += m.numVerts
    let min = [Infinity, Infinity, Infinity]
    let max = [-Infinity, -Infinity, -Infinity]
    for (let v = 0; v < m.numVerts; v++) {
      for (let c = 0; c < 3; c++) {
        const val = m.vertices[v * 3 + c]
        min[c] = Math.min(min[c], val)
        max[c] = Math.max(max[c], val)
        globalMin[c] = Math.min(globalMin[c], val)
        globalMax[c] = Math.max(globalMax[c], val)
      }
    }
    console.log(
      `  ${partName}/${m.name}: ${m.numVerts} verts, bbox [${min.map((x) => x.toFixed(1)).join(', ')}] .. [${max.map((x) => x.toFixed(1)).join(', ')}]`
    )
  }
}

console.log('Total verts:', totalVerts)
console.log(
  'Global bbox:',
  globalMin.map((x) => x.toFixed(1)).join(', '),
  '..',
  globalMax.map((x) => x.toFixed(1)).join(', ')
)
const size = globalMax.map((x, i) => x - globalMin[i])
console.log('Global size:', size.map((x) => x.toFixed(1)).join(', '))
