import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseGoldSrcMDL } from '../src/View/Mesh/GoldSrc/MDLParser.ts'
import { calcBoneTransforms } from '../src/View/Mesh/GoldSrc/MDLRig.ts'
import { readFacesData, applyBoneTransforms } from '../src/View/Mesh/GoldSrc/MDLGeometry.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buf = fs.readFileSync(path.join(__dirname, '../public/models/butterfly_knife.mdl'))
const model = parseGoldSrcMDL(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

const draw = model.sequences.find((s) => s.label === 'draw')!
console.log('draw:', draw)

const transforms = calcBoneTransforms(model, draw, 0)
console.log('bone count', model.bones.length, 'transforms', transforms.length)

for (let i = 0; i < Math.min(5, transforms.length); i++) {
  const m = transforms[i]!
  console.log(`bone ${i} ${model.bones[i]!.name}: t=[${m[12]?.toFixed(2)}, ${m[13]?.toFixed(2)}, ${m[14]?.toFixed(2)}]`)
}

const sub = model.models[0]![0]!
console.log('numVerts', sub.numVerts, 'vertices length', sub.vertices.length)
{
  let bmin = [Infinity, Infinity, Infinity]
  let bmax = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < sub.numVerts; i++) {
    for (let c = 0; c < 3; c++) {
      bmin[c] = Math.min(bmin[c], sub.vertices[i * 3 + c]!)
      bmax[c] = Math.max(bmax[c], sub.vertices[i * 3 + c]!)
    }
  }
  console.log('sub bbox', bmin.map((x) => x.toFixed(2)), bmax.map((x) => x.toFixed(2)))
}

const strip = sub.mesh[0]!
const tex = model.textures[0]!
const faces = readFacesData(model.data, strip.triIndex, sub, tex.width, tex.height)
console.log('face verts', faces.vertices.length / 3)

let maxVi = 0
let badVi = 0
for (let i = 0; i < faces.vertIndices.length; i++) {
  const vi = faces.vertIndices[i]!
  if (vi > maxVi) maxVi = vi
  if (vi < 0 || vi >= sub.numVerts) badVi++
}
console.log('max vertIndex', maxVi, 'bad indices', badVi, 'numVerts', sub.numVerts)

const skinned = applyBoneTransforms(faces.vertices, faces.vertIndices, sub.transformIndices, transforms)
let min = [Infinity, Infinity, Infinity]
let max = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < skinned.length; i += 3) {
  for (let c = 0; c < 3; c++) {
    if (!Number.isFinite(skinned[i + c])) continue
    min[c] = Math.min(min[c], skinned[i + c])
    max[c] = Math.max(max[c], skinned[i + c])
  }
}
console.log('skinned draw0 bbox', min, max)

// Raw bind pose (no skinning)
let bmin = [Infinity, Infinity, Infinity]
let bmax = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < faces.vertices.length; i += 3) {
  for (let c = 0; c < 3; c++) {
    bmin[c] = Math.min(bmin[c], faces.vertices[i + c])
    bmax[c] = Math.max(bmax[c], faces.vertices[i + c])
  }
}
console.log('bind bbox', bmin, bmax)
