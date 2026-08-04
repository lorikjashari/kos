import { readFileSync, writeFileSync } from 'fs'

function extractMethod(path, methodName) {
  const all = readFileSync(path, 'utf8').split(/\r?\n/)
  const re = new RegExp(`^\\s*(private |public |protected )?${methodName}\\(`)
  let start = -1
  for (let i = 0; i < all.length; i++) {
    if (re.test(all[i])) {
      start = i
      break
    }
  }
  if (start < 0) throw new Error(`not found ${methodName} in ${path}`)
  let brace = -1
  for (let i = start; i < all.length; i++) {
    if (all[i].includes('{')) {
      brace = i
      break
    }
  }
  let depth = 0
  let end = -1
  for (let j = brace; j < all.length; j++) {
    for (const ch of all[j]) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth === 0) {
      end = j
      break
    }
  }
  return { start, end, all, body: all.slice(start, end + 1) }
}

function report(path, name) {
  const m = extractMethod(path, name)
  console.log(path, name, m.start + 1, m.end + 1, 'count', m.end - m.start + 1)
  return m
}

report('src/UI/MainMenu.ts', 'ensureStyles')
report('src/UI/MainMenu.ts', 'buildHtml')
report('src/View/HUD/GameHUD.ts', 'ensureStyles')
