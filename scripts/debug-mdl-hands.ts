import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseGoldSrcMDL } from '../src/View/Mesh/GoldSrc/MDLParser.ts'
import { calcBoneTransforms } from '../src/View/Mesh/GoldSrc/MDLRig.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buf = fs.readFileSync(path.join(__dirname, '../public/models/butterfly_knife.mdl'))
const model = parseGoldSrcMDL(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

console.log('body parts:')
model.bodyParts.forEach((bp, i) => console.log(i, bp.name, 'models', model.models[i]!.length))

const handsPart = model.bodyParts.findIndex((bp) => bp.name.includes('cshands'))
if (handsPart >= 0) {
  const sub = model.models[handsPart]![0]!
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < sub.numVerts; i++) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], sub.vertices[i * 3 + c]!)
      max[c] = Math.max(max[c], sub.vertices[i * 3 + c]!)
    }
  }
  console.log('cshands bind verts bbox', min.map((x) => x.toFixed(2)), max.map((x) => x.toFixed(2)))
}

const draw = model.sequences.find((s) => s.label === 'draw')!
const transforms = calcBoneTransforms(model, draw, 0)

console.log('\nHand bones:')
model.bones.forEach((b, i) => {
  if (!b.name.includes('Bip01')) return
  const m = transforms[i]!
  console.log(b.name, 'parent', b.parent, 't', [m[12], m[13], m[14]].map((x) => x.toFixed(2)).join(','))
})

console.log('\nv_weapon chain:')
;['v_weapon', 'v_weapon.knife', 'v_weapon.front'].forEach((name) => {
  const i = model.bones.findIndex((b) => b.name === name)
  if (i < 0) return
  const m = transforms[i]!
  console.log(name, [m[12], m[13], m[14]].map((x) => x.toFixed(2)).join(','))
})
