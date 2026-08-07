import { readFileSync } from 'fs'

const path = process.argv[2]
const buf = readFileSync(path)
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

function str(off, len) {
  let s = ''
  for (let i = 0; i < len; i++) {
    const c = dv.getUint8(off + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

const id = str(0, 4)
const ver = dv.getInt32(4, true)
console.log('magic:', id, 'version:', ver, 'size:', buf.length)

if (id === 'IDST' && ver === 10) {
  const header = {
    name: str(8, 64),
    length: dv.getInt32(72, true),
    numbones: dv.getInt32(140, true),
    boneindex: dv.getInt32(144, true),
    numseq: dv.getInt32(164, true),
    seqindex: dv.getInt32(168, true),
    numtextures: dv.getInt32(180, true),
    textureindex: dv.getInt32(184, true),
    numbodyparts: dv.getInt32(204, true),
    bodypartindex: dv.getInt32(208, true),
  }
  console.log('header:', header)

  for (let i = 0; i < header.numseq; i++) {
    const o = header.seqindex + i * 176
    const label = str(o, 32)
    const fps = dv.getFloat32(o + 32, true)
    const flags = dv.getInt32(o + 36, true)
    const activity = dv.getInt32(o + 40, true)
    const numframes = dv.getInt32(o + 56, true)
    const numevents = dv.getInt32(o + 48, true)
    console.log(`seq[${i}]:`, label, 'fps', fps, 'frames', numframes, 'activity', activity, 'events', numevents)
  }

  for (let i = 0; i < Math.min(header.numbones, 20); i++) {
    const o = header.boneindex + i * 112
    console.log(`bone[${i}]:`, str(o, 32), 'parent', dv.getInt32(o + 32, true))
  }
  if (header.numbones > 20) console.log('...', header.numbones - 20, 'more bones')
}

// scan for embedded strings that look like seq names
const text = buf.toString('latin1')
for (const m of ['deploy', 'idle', 'slash', 'stab', 'draw', 'inspect', 'flip', 'pull']) {
  const idx = text.toLowerCase().indexOf(m)
  if (idx >= 0) console.log('found string', m, 'at', idx)
}
