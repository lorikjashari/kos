import { execSync } from 'child_process'
import { writeFileSync } from 'fs'

/**
 * Read a template literal starting AFTER the opening backtick.
 * Handles nested templates inside ${...}.
 */
function readTemplate(src, start) {
  let i = start
  let out = ''
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') {
      out += src[i] + src[i + 1]
      i += 2
      continue
    }
    if (ch === '`') return { text: out, end: i }
    if (ch === '$' && src[i + 1] === '{') {
      out += '${'
      i += 2
      let depth = 1
      while (i < src.length && depth > 0) {
        const c = src[i]
        if (c === '\\') {
          out += src[i] + src[i + 1]
          i += 2
          continue
        }
        if (c === '`') {
          out += '`'
          const nested = readTemplate(src, i + 1)
          out += nested.text + '`'
          i = nested.end + 1
          continue
        }
        if (c === '{') {
          depth++
          out += c
          i++
          continue
        }
        if (c === '}') {
          depth--
          out += c
          i++
          continue
        }
        out += c
        i++
      }
      continue
    }
    out += ch
    i++
  }
  throw new Error('unclosed template')
}

const src = execSync('git show HEAD:src/UI/MainMenu.ts', { encoding: 'utf8', maxBuffer: 20e6 })
const start = src.indexOf('private buildHtml(): string {')
if (start < 0) throw new Error('no buildHtml')
const ret = src.indexOf('return `', start)
if (ret < 0) throw new Error('no return template')
const { text: content } = readTemplate(src, ret + 'return `'.length)

let cleaned = content
  .replace(
    /\s*<button type="button" class="kos-chip is-soon" disabled data-mode="bomb">[\s\S]*?<\/button>\s*/g,
    '\n'
  )
  .replace(/\s*<div class="kos-soon-banner">[\s\S]*?<\/div>\s*/g, '\n')

const file =
  `import { MATCH_LENGTHS, type MatchLength } from '../Core/MatchStats'\n` +
  `import { DEFAULT_TEAM_SIZE, MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../Core/Teams'\n\n` +
  `export function buildMainMenuHtml(): string {\n` +
  `  return \`${cleaned}\`\n` +
  `}\n\n` +
  `export const MAIN_MENU_HTML = buildMainMenuHtml()\n`

writeFileSync('src/UI/MainMenuHtml.ts', file)
console.log('chars', cleaned.length)
console.log('screens', [...cleaned.matchAll(/data-screen="([^"]+)"/g)].map((m) => m[1]))
console.log('has perf', cleaned.includes('data-perf'))
console.log('has bomb', cleaned.includes('Bomb Defusal'))
