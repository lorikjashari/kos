import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildGoldSrcMDLScene } from '../src/View/Mesh/GoldSrc/loadGoldSrcMDL.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mdlPath = path.join(__dirname, '../public/models/butterfly_knife.mdl')

const buf = fs.readFileSync(mdlPath)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const { parts, sequences } = buildGoldSrcMDLScene(arrayBuffer)

console.log('Sequences:', sequences.map((s) => `${s.label}(${s.numFrames}f@${s.fps}fps)`).join(', '))
console.log('Mesh parts:', parts.length)

const min = [Infinity, Infinity, Infinity]
const max = [-Infinity, -Infinity, -Infinity]

for (const part of parts) {
  const frame0 = part.framePositions[0]?.[0]
  if (!frame0) continue
  for (let i = 0; i < frame0.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], frame0[i + c])
      max[c] = Math.max(max[c], frame0[i + c])
    }
  }
}

console.log('Frame0 bbox:', min.map((x) => x.toFixed(2)).join(', '), '..', max.map((x) => x.toFixed(2)).join(', '))
console.log('Frame0 size:', max.map((x, i) => (x - min[i]).toFixed(2)).join(', '))

const drawIdx = sequences.findIndex((s) => s.label === 'draw')
if (drawIdx >= 0) {
  const lastFrame = sequences[drawIdx].numFrames - 1
  const verts = parts[0]?.framePositions[drawIdx]?.[lastFrame]
  if (verts) {
    const dmin = [Infinity, Infinity, Infinity]
    const dmax = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < verts.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        dmin[c] = Math.min(dmin[c], verts[i + c])
        dmax[c] = Math.max(dmax[c], verts[i + c])
      }
    }
    console.log(`draw frame ${lastFrame} bbox:`, dmin.map((x) => x.toFixed(2)).join(', '))
  }
}
