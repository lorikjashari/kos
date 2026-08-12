/**
 * Convert CS 1.6 .spr HUD atlases to PNG for the web client.
 * Usage: node scripts/convert-cs-hud-spr.mjs [sourceSpritesDir]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultSrc = path.join(
  process.env.USERPROFILE || '',
  'Downloads/cs_green_n_yellow_full_hud/cstrike/sprites'
)
const srcDir = process.argv[2] || defaultSrc
const outDir = path.join(__dirname, '../public/hud/cs-green-yellow')

const IDSP = 0x50534449

function parseSpr(buffer) {
  if (buffer.readUInt32LE(0) !== IDSP) throw new Error('Not IDSP')
  const texFormat = buffer.readInt32LE(12)
  let offset = 40
  const palette = Buffer.alloc(768)
  if (texFormat === 0) {
    buffer.copy(palette, 0, offset, offset + 768)
    offset += 768
  }
  offset += 4 // frame type
  offset += 10 // v2 pad
  const width = buffer.readInt32LE(offset)
  const height = buffer.readInt32LE(offset + 4)
  offset += 8
  if (width <= 0 || height <= 0) return null
  if (offset + width * height > buffer.length) return null
  const indices = buffer.subarray(offset, offset + width * height)
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const idx = indices[i]
    const pi = idx * 3
    rgba[i * 4] = palette[pi]
    rgba[i * 4 + 1] = palette[pi + 1]
    rgba[i * 4 + 2] = palette[pi + 2]
    rgba[i * 4 + 3] = idx === 255 ? 0 : 255
  }
  return { width, height, rgba }
}

function sprToPng(buffer) {
  const parsed = parseSpr(buffer)
  if (!parsed) return null
  const { width, height, rgba } = parsed
  const png = new PNG({ width, height })
  rgba.copy(png.data)
  return PNG.sync.write(png)
}

if (!fs.existsSync(srcDir)) {
  console.error('Source sprites not found:', srcDir)
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
const manifest = {}

for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.spr'))) {
  const name = path.basename(file, '.spr')
  const buf = fs.readFileSync(path.join(srcDir, file))
  const png = sprToPng(buf)
  if (!png) {
    console.warn('skip (no frame)', name)
    continue
  }
  fs.writeFileSync(path.join(outDir, `${name}.png`), png)
  manifest[name] = `/hud/cs-green-yellow/${name}.png`
  console.log('wrote', name + '.png')
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('Done —', Object.keys(manifest).length, 'sprites')
