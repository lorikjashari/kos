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
  onPreviewAnim: (clip: string) => void
  /** Switch held weapon ('Usp' | 'AK') */
  onSelectWeapon: (key: string) => void
  /** '' = move whole bot; otherwise a bone key from getEditableBones() */
  onSelectBone: (boneKey: string) => void
  /** Set the selected joint's rotation (degrees, XYZ offset from bind) */
  onBoneRot: (x: number, y: number, z: number) => void
  /** Reset the selected joint to bind */
  onResetBone: () => void
  /** Returns a text summary of all joint edits (for copy/paste) */
  getPoseText: () => string
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
  previewAnim: string
  weapon: string
  selectedBone: string
  boneRot: { x: number; y: number; z: number }
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
          <div class="kos-ed-label">Animation preview</div>
          <p class="kos-ed-hint" style="margin-bottom:8px">Advanced gait on the CS terrorist — clavicles, shoulders, elbows, wrists. X-Ray is separate under Display.</p>
          <div class="kos-ed-row kos-ed-anims">
            <button type="button" data-anim="Idle" class="is-on">Idle</button>
            <button type="button" data-anim="Walking">Walking</button>
            <button type="button" data-anim="Running">Running</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Weapon</div>
          <p class="kos-ed-hint" style="margin-bottom:8px">AK uses the editor preview model (fps_mine_sketch) — gameplay AK is unchanged.</p>
          <div class="kos-ed-row kos-ed-anims">
            <button type="button" data-weapon="Usp">USP</button>
            <button type="button" data-weapon="AK" class="is-on">AK</button>
          </div>
        </section>

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Rig · pose a joint</div>
          <select id="kos-ed-bone" class="kos-ed-select">
            <option value="">Whole body (move bot)</option>
          </select>
          <div id="kos-ed-bonerot" class="kos-ed-bonerot" style="display:none">
            <div class="kos-ed-rotrow"><b>X</b><input type="range" data-brot="x" min="-180" max="180" step="1" value="0" /><span data-brotval="x">0°</span></div>
            <div class="kos-ed-rotrow"><b>Y</b><input type="range" data-brot="y" min="-180" max="180" step="1" value="0" /><span data-brotval="y">0°</span></div>
            <div class="kos-ed-rotrow"><b>Z</b><input type="range" data-brot="z" min="-180" max="180" step="1" value="0" /><span data-brotval="z">0°</span></div>
            <div class="kos-ed-row"><button type="button" data-act="resetBone">Reset this joint</button></div>
          </div>
          <p class="kos-ed-hint">Pick a joint (head, elbow, knee…) then drag the sliders — or the gizmo — to rotate it. The animation pauses so your pose sticks. Choose “Whole body” to move the bot again.</p>
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

        <section class="kos-ed-sec">
          <div class="kos-ed-label">Share your changes</div>
          <div class="kos-ed-row">
            <button type="button" id="kos-ed-copy" data-act="copyPose" class="kos-ed-copybtn">Copy my changes</button>
          </div>
          <p class="kos-ed-hint">Copies every joint you rotated as text. Paste it back in chat and I’ll bake your pose into the game.</p>
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
        .kos-ed-select {
          width: 100%;
          padding: 7px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
          color: #f1f5f9;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .kos-ed-select:focus { outline: none; border-color: rgba(125,211,252,0.6); }
        .kos-ed-bonerot { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; }
        .kos-ed-rotrow { display: flex; align-items: center; gap: 8px; }
        .kos-ed-rotrow b { width: 12px; color: #7dd3fc; font-size: 12px; }
        .kos-ed-rotrow input[type="range"] { flex: 1; accent-color: #38bdf8; }
        .kos-ed-rotrow span { width: 42px; text-align: right; font-size: 11px; color: #cbd5e1; }
        .kos-ed-copybtn { width: 100%; background: rgba(56,189,248,0.2); border-color: rgba(125,211,252,0.5); }
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

    this.root.querySelectorAll('[data-anim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clip = (btn as HTMLElement).getAttribute('data-anim') || 'Idle'
        this.handlers.onPreviewAnim(clip)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-weapon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).getAttribute('data-weapon') || 'Usp'
        this.handlers.onSelectWeapon(key)
        this.refresh()
      })
    })

    this.root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = (btn as HTMLElement).getAttribute('data-act')
        if (act === 'snap') this.handlers.onSnapGround()
        if (act === 'reset') this.handlers.onResetPose()
        if (act === 'resetBone') this.handlers.onResetBone()
        if (act === 'copyPose') {
          this.copyPose()
          return
        }
        if (act === 'fpsLook') this.handlers.onFpsLook()
        if (act === 'editCursor') this.handlers.onEditCursor()
        if (act === 'exit') this.handlers.onExit()
        this.refresh()
      })
    })

    const readRot = (): { x: number; y: number; z: number } => {
      const get = (ax: string) =>
        Number((this.root.querySelector(`[data-brot="${ax}"]`) as HTMLInputElement)?.value ?? 0)
      return { x: get('x'), y: get('y'), z: get('z') }
    }
    this.root.querySelectorAll('[data-brot]').forEach((el) => {
      el.addEventListener('input', () => {
        const r = readRot()
        this.handlers.onBoneRot(r.x, r.y, r.z)
        this.updateRotLabels(r)
      })
    })

    const scale = this.root.querySelector('#kos-ed-scale') as HTMLInputElement
    scale.addEventListener('input', () => {
      this.handlers.onScale(Number(scale.value))
      this.refresh()
    })

    const bone = this.root.querySelector('#kos-ed-bone') as HTMLSelectElement
    bone.addEventListener('change', () => {
      this.handlers.onSelectBone(bone.value)
      this.refresh()
    })
  }

  private updateRotLabels(r: { x: number; y: number; z: number }): void {
    const set = (ax: 'x' | 'y' | 'z') => {
      const el = this.root.querySelector(`[data-brotval="${ax}"]`)
      if (el) el.textContent = `${Math.round(r[ax])}°`
    }
    set('x')
    set('y')
    set('z')
  }

  private async copyPose(): Promise<void> {
    const text = this.handlers.getPoseText()
    const btn = this.root.querySelector('#kos-ed-copy') as HTMLButtonElement | null
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for non-secure contexts
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
      btn.textContent = 'Copied! Paste it in chat'
      btn.classList.add('copied')
      window.setTimeout(() => {
        btn.textContent = prev
        btn.classList.remove('copied')
      }, 1600)
    }
  }

  /** Populate the rig dropdown with the bot's editable joints. */
  public setBones(bones: Array<{ key: string; label: string }>): void {
    const sel = this.root.querySelector('#kos-ed-bone') as HTMLSelectElement | null
    if (!sel) return
    sel.innerHTML =
      '<option value="">Whole body (move bot)</option>' +
      bones.map((b) => `<option value="${b.key}">${b.label}</option>`).join('')
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

    this.root.querySelectorAll('[data-anim]').forEach((btn) => {
      btn.classList.toggle('is-on', (btn as HTMLElement).getAttribute('data-anim') === s.previewAnim)
    })

    this.root.querySelectorAll('[data-weapon]').forEach((btn) => {
      btn.classList.toggle('is-on', (btn as HTMLElement).getAttribute('data-weapon') === s.weapon)
    })

    const bone = this.root.querySelector('#kos-ed-bone') as HTMLSelectElement | null
    if (bone && document.activeElement !== bone && bone.value !== s.selectedBone) {
      bone.value = s.selectedBone
    }

    const rotBox = this.root.querySelector('#kos-ed-bonerot') as HTMLElement | null
    if (rotBox) rotBox.style.display = s.selectedBone ? 'flex' : 'none'
    if (s.selectedBone) {
      const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
      for (const ax of axes) {
        const slider = this.root.querySelector(`[data-brot="${ax}"]`) as HTMLInputElement | null
        if (slider && document.activeElement !== slider) {
          slider.value = String(Math.round(s.boneRot[ax]))
        }
      }
      this.updateRotLabels(s.boneRot)
    }

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
