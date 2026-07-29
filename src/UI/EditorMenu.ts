/**
 * In-match editor chrome for /editormode — xray, transforms, toggles.
 */
export type EditorTool = 'select' | 'translate' | 'rotate' | 'scale'

export type EditorMenuHandlers = {
  onTool: (tool: EditorTool) => void
  onToggleXray: (on: boolean) => void
  onToggleWireframe: (on: boolean) => void
  onToggleAxes: (on: boolean) => void
  onToggleLookAtPlayer: (on: boolean) => void
  onToggleHitZonesOnly: (on: boolean) => void
  onScale: (value: number) => void
  onNudge: (axis: 'x' | 'y' | 'z', delta: number) => void
  onYaw: (deltaRad: number) => void
  onSnapGround: () => void
  onResetPose: () => void
  onFpsLook: () => void
  onEditCursor: () => void
  onExit: () => void
  getState: () => EditorMenuState
}

export type EditorMenuState = {
  tool: EditorTool
  xray: boolean
  wireframe: boolean
  axes: boolean
  lookAtPlayer: boolean
  hitZonesOnly: boolean
  scale: number
  pos: { x: number; y: number; z: number }
  yawDeg: number
  fpsLook: boolean
}

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
            <strong>Editor Mode</strong>
            <span class="kos-ed-sub">Pool Day · dummy</span>
          </div>
          <button type="button" class="kos-ed-x" data-act="exit" title="Exit">✕</button>
        </header>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Transform</div>
          <div class="kos-ed-row kos-ed-tools">
            <button type="button" data-tool="select" title="Select (Q)">Sel</button>
            <button type="button" data-tool="translate" class="is-on" title="Move (W)">Move</button>
            <button type="button" data-tool="rotate" title="Rotate (E)">Rot</button>
            <button type="button" data-tool="scale" title="Scale (R)">Scale</button>
          </div>
          <p class="kos-ed-hint">Drag the gizmo on the bot. Q/W/E/R switch tools.</p>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Display</div>
          <label class="kos-ed-check"><input type="checkbox" data-tog="xray" /> X-Ray hitboxes</label>
          <label class="kos-ed-check"><input type="checkbox" data-tog="wireframe" /> Wireframe mesh</label>
          <label class="kos-ed-check"><input type="checkbox" data-tog="axes" checked /> Axes helper</label>
          <label class="kos-ed-check"><input type="checkbox" data-tog="hitZonesOnly" /> Hit zones only (hide skin)</label>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Facing</div>
          <label class="kos-ed-check"><input type="checkbox" data-tog="lookAtPlayer" checked /> Always face player</label>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Nudge</div>
          <div class="kos-ed-nudge">
            <button type="button" data-nudge="x,-0.25">−X</button>
            <button type="button" data-nudge="x,0.25">+X</button>
            <button type="button" data-nudge="y,-0.25">−Y</button>
            <button type="button" data-nudge="y,0.25">+Y</button>
            <button type="button" data-nudge="z,-0.25">−Z</button>
            <button type="button" data-nudge="z,0.25">+Z</button>
          </div>
          <div class="kos-ed-nudge">
            <button type="button" data-yaw="-15">⟲ Yaw</button>
            <button type="button" data-yaw="15">Yaw ⟳</button>
            <button type="button" data-act="snap">Snap ground</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Scale <span id="kos-ed-scale-val">1.00</span></div>
          <input id="kos-ed-scale" type="range" min="0.25" max="3" step="0.05" value="1" />
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Pose</div>
          <div class="kos-ed-row">
            <button type="button" data-act="reset">Reset pose</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Camera</div>
          <div class="kos-ed-row">
            <button type="button" data-act="editCursor" class="is-on" id="kos-ed-btn-edit">Edit cursor</button>
            <button type="button" data-act="fpsLook" id="kos-ed-btn-fps">FPS look</button>
          </div>
          <p class="kos-ed-hint">Edit cursor = use menu + gizmo. FPS look = aim around (click to lock).</p>
        </section>

        <section class="kos-ed-sec kos-ed-stats">
          <div class="kos-ed-label">Selection</div>
          <pre id="kos-ed-stats">—</pre>
        </section>
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
        .kos-ed-row, .kos-ed-tools, .kos-ed-nudge {
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
        .kos-ed-check {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          margin-bottom: 6px;
          cursor: pointer;
          user-select: none;
        }
        .kos-ed-hint {
          margin: 8px 0 0;
          font-size: 11px;
          line-height: 1.35;
          color: #8090a5;
        }
        #kos-ed-scale {
          width: 100%;
          accent-color: #38bdf8;
        }
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

    this.root.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = (btn as HTMLElement).getAttribute('data-tool') as EditorTool
        this.handlers.onTool(tool)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-tog]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = (el as HTMLElement).getAttribute('data-tog')
        const on = (el as HTMLInputElement).checked
        if (key === 'xray') this.handlers.onToggleXray(on)
        if (key === 'wireframe') this.handlers.onToggleWireframe(on)
        if (key === 'axes') this.handlers.onToggleAxes(on)
        if (key === 'lookAtPlayer') this.handlers.onToggleLookAtPlayer(on)
        if (key === 'hitZonesOnly') this.handlers.onToggleHitZonesOnly(on)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-nudge]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = (btn as HTMLElement).getAttribute('data-nudge') || 'x,0'
        const [axis, delta] = raw.split(',')
        this.handlers.onNudge(axis as 'x' | 'y' | 'z', Number(delta))
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-yaw]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deg = Number((btn as HTMLElement).getAttribute('data-yaw') || 0)
        this.handlers.onYaw((deg * Math.PI) / 180)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = (btn as HTMLElement).getAttribute('data-act')
        if (act === 'snap') this.handlers.onSnapGround()
        if (act === 'reset') this.handlers.onResetPose()
        if (act === 'fpsLook') this.handlers.onFpsLook()
        if (act === 'editCursor') this.handlers.onEditCursor()
        if (act === 'exit') this.handlers.onExit()
        this.refresh()
      })
    })

    const scale = this.root.querySelector('#kos-ed-scale') as HTMLInputElement
    scale.addEventListener('input', () => {
      this.handlers.onScale(Number(scale.value))
      this.refresh()
    })
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

    this.root.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('is-on', (btn as HTMLElement).getAttribute('data-tool') === s.tool)
    })

    const setCheck = (key: string, on: boolean) => {
      const el = this.root.querySelector(`[data-tog="${key}"]`) as HTMLInputElement | null
      if (el) el.checked = on
    }
    setCheck('xray', s.xray)
    setCheck('wireframe', s.wireframe)
    setCheck('axes', s.axes)
    setCheck('lookAtPlayer', s.lookAtPlayer)
    setCheck('hitZonesOnly', s.hitZonesOnly)

    const scale = this.root.querySelector('#kos-ed-scale') as HTMLInputElement
    const scaleVal = this.root.querySelector('#kos-ed-scale-val')
    if (scale && document.activeElement !== scale) scale.value = String(s.scale)
    if (scaleVal) scaleVal.textContent = s.scale.toFixed(2)

    this.root.querySelector('#kos-ed-btn-edit')?.classList.toggle('is-on', !s.fpsLook)
    this.root.querySelector('#kos-ed-btn-fps')?.classList.toggle('is-on', s.fpsLook)

    const stats = this.root.querySelector('#kos-ed-stats')
    if (stats) {
      stats.textContent =
        `pos  ${s.pos.x.toFixed(2)}  ${s.pos.y.toFixed(2)}  ${s.pos.z.toFixed(2)}\n` +
        `yaw  ${s.yawDeg.toFixed(1)}°\n` +
        `scale ${s.scale.toFixed(2)}\n` +
        `tool  ${s.tool}`
    }
  }
}
