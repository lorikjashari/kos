/**
 * Slim /editormode UI — tune your FPS viewmodel seat and copy coordinates.
 * No dummy bot / bone / xray chrome.
 */

export type EditorWeaponKey = 'AK' | 'Usp' | 'AWP' | 'Butterfly'

export type EditorMenuHandlers = {
  onSelectWeapon: (key: EditorWeaponKey) => void
  onNudgeOffset: (axis: 'x' | 'y' | 'z', delta: number) => void
  onNudgeRotation: (axis: 'x' | 'y' | 'z', deltaRad: number) => void
  onNudgeKnife?: (axis: 'x' | 'y' | 'z', delta: number) => void
  onNudgeKnifeScale?: (delta: number) => void
  onResetOffset: () => void
  onResetKnife?: () => void
  getCopyText: () => string
  onExit: () => void
  getState: () => EditorMenuState
}

export type EditorMenuState = {
  weapon: EditorWeaponKey
  offset: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  knife?: { x: number; y: number; z: number; scale: number }
}

const WEAPONS: Array<{ key: EditorWeaponKey; label: string }> = [
  { key: 'AK', label: 'AK' },
  { key: 'Usp', label: 'USP' },
  { key: 'AWP', label: 'AWP' },
  { key: 'Butterfly', label: 'Butterfly' },
]

export class EditorMenu {
  private root: HTMLDivElement
  private handlers: EditorMenuHandlers
  private open = false

  constructor(handlers: EditorMenuHandlers) {
    this.handlers = handlers
    this.root = document.createElement('div')
    this.root.id = 'kos-editor'
    this.root.innerHTML = `
      <div class="kos-ed-panel">
        <header class="kos-ed-head">
          <div>
            <strong>Viewmodel Tune</strong>
            <span class="kos-ed-sub">Your gun · nudge · copy coords</span>
          </div>
          <button type="button" class="kos-ed-x" data-act="exit" title="Exit">✕</button>
        </header>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Weapon</div>
          <div class="kos-ed-row kos-ed-anims">
            ${WEAPONS.map(
              (w) =>
                `<button type="button" data-weapon="${w.key}">${w.label}</button>`
            ).join('')}
          </div>
        </section>

        <section class="kos-ed-sec" id="kos-ed-knife" hidden>
          <div class="kos-ed-label">Knife prop <span class="kos-ed-fine">(hands stay put)</span></div>
          <div class="kos-ed-nudge">
            <button type="button" data-knife="x,-0.02">← Left</button>
            <button type="button" data-knife="x,0.02">Right →</button>
            <button type="button" data-knife="y,0.02">↑ Up</button>
            <button type="button" data-knife="y,-0.02">↓ Down</button>
          </div>
          <div class="kos-ed-nudge" style="margin-top:6px">
            <button type="button" data-knife="z,-0.02">−Z back</button>
            <button type="button" data-knife="z,0.02">+Z fwd</button>
            <button type="button" data-knife-scale="-0.05">Smaller</button>
            <button type="button" data-knife-scale="0.05">Bigger</button>
          </div>
          <div class="kos-ed-nudge" style="margin-top:6px">
            <button type="button" data-knife="x,-0.08">−−X</button>
            <button type="button" data-knife="x,0.08">++X</button>
            <button type="button" data-knife="y,-0.08">−−Y</button>
            <button type="button" data-knife="y,0.08">++Y</button>
          </div>
          <div class="kos-ed-row" style="margin-top:8px">
            <button type="button" data-act="reset-knife">Reset knife</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Hands offset <span class="kos-ed-fine">(moves whole viewmodel)</span></div>
          <div class="kos-ed-nudge">
            <button type="button" data-off="x,-0.02">−X</button>
            <button type="button" data-off="x,0.02">+X</button>
            <button type="button" data-off="y,-0.02">−Y</button>
            <button type="button" data-off="y,0.02">+Y</button>
            <button type="button" data-off="z,-0.02">−Z back</button>
            <button type="button" data-off="z,0.02">+Z fwd</button>
          </div>
          <div class="kos-ed-nudge" style="margin-top:6px">
            <button type="button" data-off="z,-0.08">−−Z</button>
            <button type="button" data-off="z,0.08">++Z</button>
            <button type="button" data-off="x,-0.08">−−X</button>
            <button type="button" data-off="x,0.08">++X</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Rotation (deg)</div>
          <div class="kos-ed-nudge">
            <button type="button" data-rot="x,-5">−X</button>
            <button type="button" data-rot="x,5">+X</button>
            <button type="button" data-rot="y,-5">−Y</button>
            <button type="button" data-rot="y,5">+Y</button>
            <button type="button" data-rot="z,-5">−Z</button>
            <button type="button" data-rot="z,5">+Z</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-row">
            <button type="button" data-act="reset">Reset offset</button>
            <button type="button" id="kos-ed-copy" data-act="copy" class="kos-ed-copybtn">Copy coords</button>
          </div>
          <p class="kos-ed-hint">Copies Vector3D lines for the current weapon seat. Paste into chat or code.</p>
        </section>

        <section class="kos-ed-sec kos-ed-stats">
          <div class="kos-ed-label">Live</div>
          <pre id="kos-ed-stats">—</pre>
        </section>

        <p class="kos-ed-hint">Click the game to look around. WASD to walk. Esc / ✕ exits.</p>
      </div>
    `

    if (!document.getElementById('kos-editor-styles')) {
      const style = document.createElement('style')
      style.id = 'kos-editor-styles'
      style.textContent = `
        #kos-editor {
          display: none;
          position: fixed;
          top: 0; right: 0; bottom: 0;
          z-index: 10040;
          pointer-events: none;
          font-family: "Segoe UI", Arial, sans-serif;
        }
        #kos-editor.is-open { display: block; }
        .kos-ed-panel {
          pointer-events: auto;
          width: min(300px, 92vw);
          height: 100%;
          overflow-y: auto;
          padding: 14px 14px 28px;
          background: rgba(8, 12, 18, 0.92);
          border-left: 1px solid rgba(255,255,255,0.12);
          color: #e8eef7;
          box-shadow: -12px 0 40px rgba(0,0,0,0.35);
        }
        .kos-ed-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }
        .kos-ed-head strong {
          display: block;
          font-size: 15px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .kos-ed-sub {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: #8b9bb0;
        }
        .kos-ed-x {
          border: 0;
          background: rgba(255,255,255,0.08);
          color: #fff;
          width: 28px; height: 28px;
          border-radius: 6px;
          cursor: pointer;
        }
        .kos-ed-sec { margin-bottom: 14px; }
        .kos-ed-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7dd3fc;
          margin-bottom: 8px;
        }
        .kos-ed-fine { font-weight: 500; letter-spacing: 0; text-transform: none; color: #8090a5; }
        .kos-ed-row, .kos-ed-nudge, .kos-ed-anims {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .kos-ed-panel button {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: #f1f5f9;
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .kos-ed-panel button:hover { background: rgba(125,211,252,0.15); }
        .kos-ed-panel button.is-on {
          background: rgba(56,189,248,0.28);
          border-color: rgba(125,211,252,0.55);
        }
        .kos-ed-hint {
          margin: 8px 0 0;
          font-size: 11px;
          line-height: 1.35;
          color: #8090a5;
        }
        .kos-ed-copybtn { flex: 1; background: rgba(56,189,248,0.2); border-color: rgba(125,211,252,0.5); }
        .kos-ed-copybtn.copied { background: rgba(74,222,128,0.3); border-color: rgba(74,222,128,0.6); }
        .kos-ed-stats pre {
          margin: 0;
          font-size: 11px;
          line-height: 1.45;
          color: #cbd5e1;
          background: rgba(0,0,0,0.25);
          padding: 8px 10px;
          border-radius: 6px;
          overflow: auto;
        }
      `
      document.head.appendChild(style)
    }

    document.body.appendChild(this.root)
    this.bind()
  }

  private bind(): void {
    this.root.addEventListener('mousedown', (e) => e.stopPropagation())
    this.root.addEventListener('click', (e) => e.stopPropagation())
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false })

    this.root.querySelectorAll('[data-weapon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = ((btn as HTMLElement).getAttribute('data-weapon') || 'AK') as EditorWeaponKey
        this.handlers.onSelectWeapon(key)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-knife]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).getAttribute('data-knife') || 'y,0'
        const [axis, delta] = raw.split(',')
        this.handlers.onNudgeKnife?.(axis as 'x' | 'y' | 'z', Number(delta))
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-knife-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = Number((btn as HTMLElement).getAttribute('data-knife-scale') || '0')
        this.handlers.onNudgeKnifeScale?.(delta)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-off]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).getAttribute('data-off') || 'z,0'
        const [axis, delta] = raw.split(',')
        this.handlers.onNudgeOffset(axis as 'x' | 'y' | 'z', Number(delta))
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-rot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).getAttribute('data-rot') || 'y,0'
        const [axis, deg] = raw.split(',')
        this.handlers.onNudgeRotation(axis as 'x' | 'y' | 'z', (Number(deg) * Math.PI) / 180)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = (btn as HTMLElement).getAttribute('data-act')
        if (act === 'reset') this.handlers.onResetOffset()
        if (act === 'reset-knife') this.handlers.onResetKnife?.()
        if (act === 'copy') {
          void this.copyCoords()
          return
        }
        if (act === 'exit') this.handlers.onExit()
        this.refresh()
      })
    })
  }

  private async copyCoords(): Promise<void> {
    const text = this.handlers.getCopyText()
    const btn = this.root.querySelector('#kos-ed-copy') as HTMLButtonElement | null
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta)
    }
    if (btn) {
      const prev = btn.textContent
      btn.textContent = 'Copied!'
      btn.classList.add('copied')
      window.setTimeout(() => {
        btn.textContent = prev
        btn.classList.remove('copied')
      }, 1400)
    }
  }

  public isOpen(): boolean {
    return this.open
  }

  public show(): void {
    this.open = true
    this.root.classList.add('is-open')
    this.refresh()
  }

  public hide(): void {
    this.open = false
    this.root.classList.remove('is-open')
  }

  public refresh(): void {
    if (!this.open) return
    const s = this.handlers.getState()
    this.root.querySelectorAll('[data-weapon]').forEach((btn) => {
      btn.classList.toggle('is-on', (btn as HTMLElement).getAttribute('data-weapon') === s.weapon)
    })
    const knifeSec = this.root.querySelector('#kos-ed-knife') as HTMLElement | null
    if (knifeSec) knifeSec.hidden = s.weapon !== 'Butterfly'

    const stats = this.root.querySelector('#kos-ed-stats')
    if (stats) {
      const o = s.offset
      const r = s.rotation
      let text =
        `${s.weapon}\n` +
        `hands   ${o.x.toFixed(3)}  ${o.y.toFixed(3)}  ${o.z.toFixed(3)}\n` +
        `rot°    ${((r.x * 180) / Math.PI).toFixed(1)}  ${((r.y * 180) / Math.PI).toFixed(1)}  ${((r.z * 180) / Math.PI).toFixed(1)}`
      if (s.knife) {
        const k = s.knife
        text +=
          `\nknife   ${k.x.toFixed(3)}  ${k.y.toFixed(3)}  ${k.z.toFixed(3)}\n` +
          `scale   ${k.scale.toFixed(3)}×`
      }
      stats.textContent = text
    }
  }
}

/** @deprecated kept so old imports of EditorTool still typecheck during transition */
export type EditorTool = 'select' | 'translate' | 'rotate' | 'scale'
