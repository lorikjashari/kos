const TIPS_KEY = 'kos-tips-seen-v1'

export function hasSeenFirstRunTips(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === '1'
  } catch {
    return true
  }
}

export function markFirstRunTipsSeen(): void {
  try {
    localStorage.setItem(TIPS_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** First-run overlay: movement, loadout, TDM rounds. */
export function mountFirstRunTips(onDone?: () => void): void {
  if (hasSeenFirstRunTips()) {
    onDone?.()
    return
  }
  if (document.getElementById('kos-tips')) return

  const style = document.createElement('style')
  style.textContent = `
    #kos-tips {
      position: fixed; inset: 0; z-index: 11000;
      display: flex; align-items: center; justify-content: center;
      padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
      background: rgba(6, 10, 18, 0.72);
      backdrop-filter: blur(6px);
    }
    #kos-tips .panel {
      width: min(440px, 100%);
      background: #f7f8fb;
      color: #122;
      border-radius: 16px;
      padding: 22px 22px 18px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.35);
      font-family: Outfit, Segoe UI, sans-serif;
    }
    #kos-tips h2 {
      margin: 0 0 6px;
      font-size: 22px;
      letter-spacing: 0.04em;
    }
    #kos-tips .lead {
      margin: 0 0 16px;
      color: #456;
      font-size: 13px;
      line-height: 1.45;
    }
    #kos-tips ol {
      margin: 0 0 18px;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 13px;
      line-height: 1.4;
      color: #234;
    }
    #kos-tips li strong { color: #0b3d91; }
    #kos-tips button {
      width: 100%;
      appearance: none;
      border: none;
      cursor: pointer;
      background: #1a5fff;
      color: #fff;
      font: 750 14px Outfit, Segoe UI, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 14px 12px;
      border-radius: 10px;
    }
    #kos-tips button:hover { background: #0f4de0; }
  `
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = 'kos-tips'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'kos-tips-title')
  root.innerHTML = `
    <div class="panel">
      <h2 id="kos-tips-title">Quick tips</h2>
      <p class="lead">KoS is a browser FPS — not a Valve product. A few controls to get you shooting.</p>
      <ol>
        <li><strong>Move</strong> — WASD / left stick. Jump with Space or scroll wheel. Crouch to peek.</li>
        <li><strong>Loadout</strong> — at match start pick AK or AWP (keys 1 / 2). Slot 2 is USP, slot 3 is butterfly knife.</li>
        <li><strong>Team Deathmatch</strong> — Dust II rounds: freeze, wipe the other side, first to N round wins. Die mid-round? Scroll to spectate teammates.</li>
      </ol>
      <button type="button" id="kos-tips-ok">Got it</button>
    </div>
  `
  document.body.appendChild(root)

  const close = () => {
    markFirstRunTipsSeen()
    root.remove()
    style.remove()
    onDone?.()
  }
  root.querySelector('#kos-tips-ok')?.addEventListener('click', close)
  root.addEventListener('click', (e) => {
    if (e.target === root) close()
  })
}
