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
  if (start < 0) throw new Error(`not found ${methodName}`)
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
  return { start, end, all }
}

/** Pull the first template literal assigned to textContent / return inside the method. */
function extractTemplateLiteral(lines) {
  const text = lines.join('\n')
  const markers = ['style.textContent = `', 'return `']
  let idx = -1
  let marker = ''
  for (const m of markers) {
    const i = text.indexOf(m)
    if (i >= 0 && (idx < 0 || i < idx)) {
      idx = i
      marker = m
    }
  }
  if (idx < 0) throw new Error('no template literal')
  let i = idx + marker.length
  let out = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      out += ch + text[i + 1]
      i += 2
      continue
    }
    if (ch === '`') break
    out += ch
    i++
  }
  return out
}

function writeExport(outPath, exportName, content) {
  const file = `export const ${exportName} = \`${content.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`\n`
  writeFileSync(outPath, file)
  console.log('wrote', outPath, 'chars', content.length)
}

function spliceMethod(path, methodName, replacementLines) {
  const { start, end, all } = extractMethod(path, methodName)
  const next = [...all.slice(0, start), ...replacementLines, ...all.slice(end + 1)]
  writeFileSync(path, next.join('\n') + (next[next.length - 1] === '' ? '' : '\n'))
  console.log('spliced', path, methodName, 'removed', end - start + 1, 'lines')
}

// MainMenu styles
{
  const { start, end, all } = extractMethod('src/UI/MainMenu.ts', 'ensureStyles')
  const css = extractTemplateLiteral(all.slice(start, end + 1))
  writeExport('src/UI/MainMenuStyles.ts', 'MAIN_MENU_CSS', css)
  spliceMethod('src/UI/MainMenu.ts', 'ensureStyles', [
    '  private ensureStyles(): void {',
    "    document.getElementById('kos-menu-styles')?.remove()",
    "    const style = document.createElement('style')",
    "    style.id = 'kos-menu-styles'",
    '    style.textContent = MAIN_MENU_CSS',
    '    document.head.appendChild(style)',
    '  }',
  ])
}

// MainMenu html
{
  const { start, end, all } = extractMethod('src/UI/MainMenu.ts', 'buildHtml')
  const html = extractTemplateLiteral(all.slice(start, end + 1))
  writeExport('src/UI/MainMenuHtml.ts', 'MAIN_MENU_HTML', html)
  spliceMethod('src/UI/MainMenu.ts', 'buildHtml', [
    '  private buildHtml(): string {',
    '    return MAIN_MENU_HTML',
    '  }',
  ])
}

// GameHUD styles
{
  const { start, end, all } = extractMethod('src/View/HUD/GameHUD.ts', 'ensureStyles')
  const css = extractTemplateLiteral(all.slice(start, end + 1))
  writeExport('src/View/HUD/GameHUDStyles.ts', 'GAME_HUD_CSS', css)
  spliceMethod('src/View/HUD/GameHUD.ts', 'ensureStyles', [
    '  private ensureStyles(): void {',
    "    document.getElementById('game-hud-styles')?.remove()",
    "    const style = document.createElement('style')",
    "    style.id = 'game-hud-styles'",
    '    style.textContent = GAME_HUD_CSS',
    '    document.head.appendChild(style)',
    '  }',
  ])
}
