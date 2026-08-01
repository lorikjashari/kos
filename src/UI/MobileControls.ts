import { Key } from '../Input/KeyBinding'
import type { InputManager } from '../Input/InputManager'
import {
  DEFAULT_MOBILE_LAYOUT,
  MOBILE_CONTROL_META,
  normalizeMobileSettings,
  type MobileControlId,
  type MobileControlsSettings,
  type MobileLayoutMap,
} from './SettingsStore'
import { isTouchDevice } from './MobileDevice'
import { Game } from '../Game'

const ACTION_KEYS: Partial<Record<MobileControlId, Key>> = {
  fire: Key.Left_Click,
  aim: Key.Right_Click,
  jump: Key.Jump,
  crouch: Key.Crouch,
  reload: Key.Reload,
  walk: Key.Shift,
  weapon1: Key.One,
  weapon2: Key.Two,
  weapon3: Key.Three,
  leanLeft: Key.LeanLeft,
  leanRight: Key.LeanRight,
}

const imgIcon = (src: string, wide = false) =>
  `<img class="kos-mc-img${wide ? ' is-wide' : ''}" src="${src}" alt="" draggable="false" />`

const ICONS: Partial<Record<MobileControlId, string>> = {
  fire: imgIcon('/icons/fire.png'),
  aim: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>`,
  jump: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V7M12 7l-4.2 4.2M12 7l4.2 4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  crouch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v12M12 17l-4.2-4.2M12 17l4.2-4.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  reload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M19.5 4.8v4.4h-4.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  weapon1: imgIcon('/icons/weapon-ak.png', true),
  weapon2: imgIcon('/icons/weapon-pistol.png', true),
  weapon3: imgIcon('/icons/weapon-knife.png', true),
  leanLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5L9 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  leanRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5L15 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  scoreboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
}

/**
 * Standoff-style mobile HUD. Uses div hit-targets (not <button>) so iOS
 * multi-touch can hold fire+jump+stick together without focus/selection fights.
 */
export class MobileControls {
  private root: HTMLElement | null = null
  private input: InputManager
  private settings: MobileControlsSettings
  private active = false
  private editMode = false
  private lookPointerId: number | null = null
  private lastLookX = 0
  private lastLookY = 0
  private btnLook = new Map<number, { lastX: number; lastY: number; armed: boolean }>()
  private joyPointerId: number | null = null
  private joyOriginX = 0
  private joyOriginY = 0
  private joyRadius = 60
  private joyKnob: HTMLElement | null = null
  private dragId: MobileControlId | null = null
  private dragPointerId: number | null = null
  private dragOffsetX = 0
  private dragOffsetY = 0
  private selectedId: MobileControlId | null = null
  private onLayoutChanged: ((layout: MobileLayoutMap) => void) | null = null
  private pressed = new Set<MobileControlId>()
  private holdPointers = new Map<number, MobileControlId>()
  private toggled = new Set<MobileControlId>()
  private boundVis = false
  private windowBound = false
  private onWinMove = (e: PointerEvent) => this.onWindowPointerMove(e)
  private onWinUp = (e: PointerEvent) => this.onWindowPointerUp(e)

  constructor(input: InputManager, settings?: MobileControlsSettings) {
    this.input = input
    this.settings = normalizeMobileSettings(settings)
    this.ensureStyles()
    this.bindVisibility()
  }

  public applySettings(settings: MobileControlsSettings): void {
    this.settings = normalizeMobileSettings(settings)
    if (this.root) this.renderButtons()
  }

  public setEditMode(edit: boolean, onLayoutChanged?: (layout: MobileLayoutMap) => void): void {
    this.editMode = edit
    this.onLayoutChanged = onLayoutChanged || null
    if (edit) {
      this.mount()
      this.root?.classList.add('is-edit')
      this.root?.classList.add('is-on')
      this.renderButtons()
    } else {
      this.root?.classList.remove('is-edit')
      if (!this.active) this.root?.classList.remove('is-on')
      this.selectedId = null
      this.renderButtons()
    }
  }

  public setActive(active: boolean): void {
    const want = active && this.settings.enabled && isTouchDevice()
    this.active = want
    if (want) {
      this.mount()
      this.root?.classList.add('is-on')
      this.input.setMobileMode(true)
    } else {
      this.releaseAll()
      if (!this.editMode) {
        this.root?.classList.remove('is-on')
        this.input.setMobileMode(false)
      }
    }
  }

  public destroy(): void {
    this.releaseAll()
    this.unbindWindowPointers()
    this.root?.remove()
    this.root = null
  }

  public getSelectedId(): MobileControlId | null {
    return this.selectedId
  }

  public selectControl(id: MobileControlId): void {
    this.selectedId = id
    this.renderButtons()
  }

  public updateSelectedSlot(patch: Partial<MobileLayoutMap[MobileControlId]>): void {
    if (!this.selectedId) return
    this.settings.layout[this.selectedId] = {
      ...this.settings.layout[this.selectedId],
      ...patch,
    }
    this.renderButtons()
    this.onLayoutChanged?.(this.settings.layout)
  }

  public resetLayout(): void {
    this.settings.layout = { ...DEFAULT_MOBILE_LAYOUT }
    this.renderButtons()
    this.onLayoutChanged?.(this.settings.layout)
  }

  private bindVisibility(): void {
    if (this.boundVis || typeof document === 'undefined') return
    this.boundVis = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll()
    })
    window.addEventListener('blur', () => this.releaseAll())
  }

  private mount(): void {
    if (this.root) return
    this.root = document.createElement('div')
    this.root.id = 'kos-mobile-controls'
    this.root.setAttribute('aria-hidden', 'false')
    this.root.innerHTML = `
      <div class="kos-mc-look" data-look="1"></div>
      <div class="kos-mc-layer" data-layer="1"></div>
      <div class="kos-mc-editbar" hidden>
        <span class="kos-mc-edit-hint">Drag buttons · tap to select · adjust size in the dock</span>
      </div>
    `
    document.body.appendChild(this.root)
    this.bindRoot()
    this.renderButtons()
  }

  private bindRoot(): void {
    if (!this.root) return
    const look = this.root.querySelector('.kos-mc-look') as HTMLElement
    const opts: AddEventListenerOptions = { passive: false }

    look.addEventListener('pointerdown', (e) => this.onLookDown(e), opts)
    // Never end look on lost capture — iOS selection/loupe can steal capture mid-swipe
    look.addEventListener('lostpointercapture', (e) => this.onLookLostCapture(e as PointerEvent), opts)

    this.root.addEventListener('pointerdown', (e) => this.onUiPointerDown(e), opts)
    this.root.addEventListener('lostpointercapture', (e) => this.onLostCapture(e as PointerEvent), opts)
    this.root.addEventListener('contextmenu', (e) => e.preventDefault())
    this.root.addEventListener('selectstart', (e) => e.preventDefault())
    this.root.addEventListener('dragstart', (e) => e.preventDefault())
    this.bindWindowPointers()
  }

  private bindWindowPointers(): void {
    if (this.windowBound || typeof window === 'undefined') return
    this.windowBound = true
    const opts: AddEventListenerOptions = { passive: false }
    window.addEventListener('pointermove', this.onWinMove, opts)
    window.addEventListener('pointerup', this.onWinUp, opts)
    window.addEventListener('pointercancel', this.onWinUp, opts)
  }

  private unbindWindowPointers(): void {
    if (!this.windowBound) return
    this.windowBound = false
    window.removeEventListener('pointermove', this.onWinMove)
    window.removeEventListener('pointerup', this.onWinUp)
    window.removeEventListener('pointercancel', this.onWinUp)
  }

  private onWindowPointerMove(e: PointerEvent): void {
    if (!this.active && !this.editMode) return
    if (this.lookPointerId === e.pointerId) {
      this.onLookMove(e)
      return
    }
    if (
      this.joyPointerId === e.pointerId ||
      this.holdPointers.has(e.pointerId) ||
      this.btnLook.has(e.pointerId) ||
      this.dragPointerId === e.pointerId
    ) {
      this.onUiPointerMove(e)
    }
  }

  private onWindowPointerUp(e: PointerEvent): void {
    if (this.lookPointerId === e.pointerId) {
      this.onLookUp(e)
      return
    }
    if (
      this.joyPointerId === e.pointerId ||
      this.holdPointers.has(e.pointerId) ||
      this.dragPointerId === e.pointerId
    ) {
      this.onUiPointerUp(e)
    }
  }

  private renderButtons(): void {
    if (!this.root) return
    const layer = this.root.querySelector('.kos-mc-layer') as HTMLElement
    const editbar = this.root.querySelector('.kos-mc-editbar') as HTMLElement
    editbar.hidden = !this.editMode
    const html: string[] = []
    for (const meta of MOBILE_CONTROL_META) {
      const slot = this.settings.layout[meta.id]
      if (!slot.visible && !this.editMode) continue
      const base = meta.id === 'joystick' ? 138 : meta.id === 'fire' ? 102 : 70
      const px = Math.round(base * slot.size)
      const selected = this.selectedId === meta.id ? ' is-selected' : ''
      const hidden = !slot.visible ? ' is-hidden-slot' : ''
      const down = this.pressed.has(meta.id) || this.toggled.has(meta.id) ? ' is-down' : ''
      const tone =
        meta.id === 'fire'
          ? ' is-fire'
          : meta.id === 'aim'
            ? ' is-aim'
            : meta.id === 'jump'
              ? ' is-jump'
              : ''
      if (meta.id === 'joystick') {
        html.push(`
          <div class="kos-mc-btn kos-mc-joy${selected}${hidden}${down}" data-id="joystick" role="group" aria-label="${meta.label}"
            style="left:${slot.x}%;top:${slot.y}%;width:${px}px;height:${px}px;opacity:${slot.opacity}">
            <div class="kos-mc-hit"></div>
            <div class="kos-mc-joy-ring"></div>
            <div class="kos-mc-joy-knob" data-knob="1"></div>
            <span class="kos-mc-label">${meta.label}</span>
          </div>`)
      } else {
        const icon = ICONS[meta.id] || `<span class="kos-mc-fallback">${meta.glyph}</span>`
        html.push(`
          <div class="kos-mc-btn${tone}${selected}${hidden}${down}" data-id="${meta.id}" role="button" aria-label="${meta.label}"
            style="left:${slot.x}%;top:${slot.y}%;width:${px}px;height:${px}px;opacity:${slot.opacity}">
            <div class="kos-mc-hit"></div>
            <span class="kos-mc-glyph">${icon}</span>
            <span class="kos-mc-label">${meta.label}</span>
          </div>`)
      }
    }
    layer.innerHTML = html.join('')
    this.joyKnob = this.root.querySelector('[data-knob]') as HTMLElement | null

    // Re-assert capture after DOM rebuild so multi-touch holds survive a rare re-render
    for (const [pid, id] of this.holdPointers) {
      const el = layer.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      try {
        el?.setPointerCapture?.(pid)
      } catch {
        /* ignore */
      }
    }
    if (this.joyPointerId != null) {
      const joy = layer.querySelector('[data-id="joystick"]') as HTMLElement | null
      try {
        joy?.setPointerCapture?.(this.joyPointerId)
      } catch {
        /* ignore */
      }
    }
  }

  private canAimWhileHold(id: MobileControlId): boolean {
    return id === 'fire' || id === 'jump' || id === 'aim' || id === 'crouch'
  }

  private vibrateLight(): void {
    try {
      navigator.vibrate?.(10)
    } catch {
      /* ignore */
    }
  }

  private onLookDown(e: PointerEvent): void {
    if (this.editMode || !this.active) return
    if ((e.target as HTMLElement).closest('[data-id]')) return
    // Another finger already aiming via look — ignore (buttons own their pointers)
    if (this.lookPointerId != null && this.lookPointerId !== e.pointerId) return
    e.preventDefault()
    this.lookPointerId = e.pointerId
    this.lastLookX = e.clientX
    this.lastLookY = e.clientY
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  private onLookMove(e: PointerEvent): void {
    if (this.editMode || !this.active) return
    if (this.lookPointerId !== e.pointerId) return
    e.preventDefault()
    const dx = e.clientX - this.lastLookX
    const dy = e.clientY - this.lastLookY
    this.lastLookX = e.clientX
    this.lastLookY = e.clientY
    const sens = this.settings.lookSensitivity
    this.input.applyLookDelta(dx * sens * 1.4, dy * sens * 1.4)
  }

  private onLookUp(e: PointerEvent): void {
    if (this.lookPointerId !== e.pointerId) return
    this.lookPointerId = null
  }

  private onLookLostCapture(e: PointerEvent): void {
    if (this.lookPointerId !== e.pointerId || !this.active || this.editMode) return
    const look = this.root?.querySelector('.kos-mc-look') as HTMLElement | null
    try {
      look?.setPointerCapture?.(e.pointerId)
    } catch {
      /* keep tracking via window listeners */
    }
  }

  private onLostCapture(e: PointerEvent): void {
    // Re-capture holds instead of dropping mid multi-touch (iOS loupe / focus steals)
    const id = this.holdPointers.get(e.pointerId)
    if (id && this.active && !this.editMode) {
      const el = this.root?.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      try {
        el?.setPointerCapture?.(e.pointerId)
        return
      } catch {
        /* fall through */
      }
    }
    if (this.joyPointerId === e.pointerId && this.active) {
      const joy = this.root?.querySelector('[data-id="joystick"]') as HTMLElement | null
      try {
        joy?.setPointerCapture?.(e.pointerId)
        return
      } catch {
        /* fall through */
      }
    }
  }

  private onUiPointerDown(e: PointerEvent): void {
    const btn = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null
    if (!btn || !this.root?.contains(btn)) return
    const id = btn.getAttribute('data-id') as MobileControlId
    e.preventDefault()
    e.stopPropagation()

    try {
      btn.setPointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }

    if (this.editMode) {
      this.selectedId = id
      this.dragId = id
      this.dragPointerId = e.pointerId
      const rect = this.root!.getBoundingClientRect()
      const slot = this.settings.layout[id]
      this.dragOffsetX = (e.clientX - rect.left) / rect.width * 100 - slot.x
      this.dragOffsetY = (e.clientY - rect.top) / rect.height * 100 - slot.y
      this.renderButtons()
      this.onLayoutChanged?.(this.settings.layout)
      return
    }

    if (!this.active) return

    // Don't steal look pointer if this finger was looking
    if (this.lookPointerId === e.pointerId) this.lookPointerId = null

    if (id === 'joystick') {
      if (this.joyPointerId != null && this.joyPointerId !== e.pointerId) return
      this.joyPointerId = e.pointerId
      const rect = btn.getBoundingClientRect()
      this.joyOriginX = rect.left + rect.width / 2
      this.joyOriginY = rect.top + rect.height / 2
      this.joyRadius = rect.width / 2
      this.updateJoystick(e.clientX, e.clientY, this.joyRadius)
      this.vibrateLight()
      return
    }

    if (id === 'scoreboard') {
      Game.getInstance().renderer?.hud?.toggleScoreboard()
      btn.classList.add('is-down')
      window.setTimeout(() => btn.classList.remove('is-down'), 140)
      this.vibrateLight()
      return
    }

    if (this.isToggleControl(id)) {
      this.flipToggle(id)
      this.vibrateLight()
      return
    }

    // Same finger already holding another action — release old first
    const prev = this.holdPointers.get(e.pointerId)
    if (prev && prev !== id) this.releaseHold(e.pointerId)

    this.holdPointers.set(e.pointerId, id)
    if (this.canAimWhileHold(id)) {
      this.btnLook.set(e.pointerId, { lastX: e.clientX, lastY: e.clientY, armed: false })
    }
    this.press(id, true)
    this.vibrateLight()
  }

  private onUiPointerMove(e: PointerEvent): void {
    if (this.editMode && this.dragId && this.dragPointerId === e.pointerId && this.root) {
      e.preventDefault()
      const rect = this.root.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width * 100 - this.dragOffsetX
      const y = (e.clientY - rect.top) / rect.height * 100 - this.dragOffsetY
      this.settings.layout[this.dragId] = {
        ...this.settings.layout[this.dragId],
        x: Math.max(2, Math.min(98, x)),
        y: Math.max(4, Math.min(96, y)),
      }
      const el = this.root.querySelector(`[data-id="${this.dragId}"]`) as HTMLElement | null
      if (el) {
        el.style.left = `${this.settings.layout[this.dragId].x}%`
        el.style.top = `${this.settings.layout[this.dragId].y}%`
      }
      return
    }

    if (this.joyPointerId === e.pointerId) {
      e.preventDefault()
      this.updateJoystick(e.clientX, e.clientY, this.joyRadius)
      return
    }

    const look = this.btnLook.get(e.pointerId)
    if (look && this.active && !this.editMode) {
      e.preventDefault()
      const dx = e.clientX - look.lastX
      const dy = e.clientY - look.lastY
      const dist = Math.hypot(dx, dy)
      if (!look.armed) {
        if (dist < 3) return
        look.armed = true
      }
      look.lastX = e.clientX
      look.lastY = e.clientY
      const sens = this.settings.lookSensitivity
      this.input.applyLookDelta(dx * sens * 1.4, dy * sens * 1.4)
    }
  }

  private onUiPointerUp(e: PointerEvent): void {
    if (this.editMode && this.dragPointerId === e.pointerId) {
      this.dragId = null
      this.dragPointerId = null
      this.onLayoutChanged?.(this.settings.layout)
      return
    }

    if (this.joyPointerId === e.pointerId) {
      this.joyPointerId = null
      this.clearJoystick()
      return
    }

    this.releaseHold(e.pointerId)
  }

  private releaseHold(pointerId: number): void {
    this.btnLook.delete(pointerId)
    const id = this.holdPointers.get(pointerId)
    if (!id || id === 'joystick') return
    this.holdPointers.delete(pointerId)
    if (this.isToggleControl(id)) return
    // Keep pressed if another finger still holds the same control
    for (const held of this.holdPointers.values()) {
      if (held === id) return
    }
    this.press(id, false)
  }

  private isToggleControl(id: MobileControlId): boolean {
    if (id === 'crouch') return this.settings.crouchMode === 'toggle'
    if (id === 'leanLeft' || id === 'leanRight') return this.settings.leanMode === 'toggle'
    return false
  }

  private flipToggle(id: MobileControlId): void {
    const next = !this.toggled.has(id)
    if ((id === 'leanLeft' || id === 'leanRight') && next) {
      const other: MobileControlId = id === 'leanLeft' ? 'leanRight' : 'leanLeft'
      if (this.toggled.has(other)) {
        this.toggled.delete(other)
        this.press(other, false)
      }
    }
    if (next) this.toggled.add(id)
    else this.toggled.delete(id)
    this.press(id, next)
  }

  private updateJoystick(x: number, y: number, radius: number): void {
    let dx = x - this.joyOriginX
    let dy = y - this.joyOriginY
    const len = Math.hypot(dx, dy) || 1
    const max = Math.max(20, radius * 0.44)
    if (len > max) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    if (this.joyKnob) {
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const nx = dx / max
    const ny = dy / max
    const mag = Math.min(1, Math.hypot(nx, ny))
    const dead = this.settings.joystickDeadzone
    let analog = 0
    if (mag > dead) {
      analog = Math.pow((mag - dead) / Math.max(0.001, 1 - dead), 0.85)
    }
    this.input.setMoveAnalog(analog)
    this.input.setActionPressed(Key.Forward, ny < -dead)
    this.input.setActionPressed(Key.Backward, ny > dead)
    this.input.setActionPressed(Key.Left, nx < -dead)
    this.input.setActionPressed(Key.Right, nx > dead)
  }

  private clearJoystick(): void {
    if (this.joyKnob) this.joyKnob.style.transform = 'translate(0,0)'
    this.input.setMoveAnalog(0)
    this.input.setActionPressed(Key.Forward, false)
    this.input.setActionPressed(Key.Backward, false)
    this.input.setActionPressed(Key.Left, false)
    this.input.setActionPressed(Key.Right, false)
  }

  private press(id: MobileControlId, down: boolean): void {
    const key = ACTION_KEYS[id]
    if (!key) return
    if (down) this.pressed.add(id)
    else this.pressed.delete(id)
    this.input.setActionPressed(key, down)
    const el = this.root?.querySelector(`[data-id="${id}"]`)
    el?.classList.toggle('is-down', down || this.toggled.has(id))
  }

  private releaseAll(): void {
    for (const id of [...this.pressed]) {
      if (!this.toggled.has(id)) this.press(id, false)
    }
    for (const id of [...this.toggled]) this.press(id, false)
    this.toggled.clear()
    this.holdPointers.clear()
    this.btnLook.clear()
    this.clearJoystick()
    this.joyPointerId = null
    this.lookPointerId = null
  }

  private ensureStyles(): void {
    const style =
      (document.getElementById('kos-mc-styles') as HTMLStyleElement | null) ||
      document.createElement('style')
    style.id = 'kos-mc-styles'
    style.textContent = `
      #kos-mobile-controls {
        position: fixed; inset: 0; z-index: 32;
        pointer-events: none;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
        display: none;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
      }
      #kos-mobile-controls.is-on { display: block; }
      #kos-mobile-controls.is-edit { z-index: 50; }
      #kos-mobile-controls .kos-mc-look {
        position: absolute; inset: 0;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      #kos-mobile-controls.is-edit .kos-mc-look {
        pointer-events: none;
        background: rgba(4,10,20,0.35);
      }
      #kos-mobile-controls .kos-mc-layer {
        position: absolute; inset: 0;
        pointer-events: none;
      }
      #kos-mobile-controls .kos-mc-btn {
        position: absolute;
        transform: translate(-50%, -50%);
        border: 1.5px solid rgba(255,255,255,0.34);
        border-radius: 999px;
        background:
          linear-gradient(165deg, rgba(255,255,255,0.20), rgba(255,255,255,0.04) 42%, rgba(6,12,24,0.42)),
          radial-gradient(circle at 32% 26%, rgba(255,255,255,0.24), transparent 55%);
        color: #fff;
        pointer-events: auto;
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.22),
          inset 0 -8px 16px rgba(0,0,0,0.18),
          0 10px 24px rgba(0,0,0,0.34);
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        outline: none;
        transition: transform 70ms ease, border-color 70ms ease, background 70ms ease, box-shadow 70ms ease;
        will-change: transform;
      }
      #kos-mobile-controls .kos-mc-hit {
        position: absolute;
        inset: -14%;
        border-radius: inherit;
        pointer-events: auto;
      }
      #kos-mobile-controls .kos-mc-btn.is-down {
        transform: translate(-50%, -50%) scale(0.94);
        border-color: rgba(170,210,255,0.92);
        background:
          linear-gradient(165deg, rgba(110,175,255,0.55), rgba(24,70,150,0.58)),
          radial-gradient(circle at 32% 26%, rgba(180,220,255,0.45), transparent 58%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.28),
          0 0 0 2px rgba(90,160,255,0.28),
          0 8px 18px rgba(20,80,180,0.35);
      }
      #kos-mobile-controls .kos-mc-btn.is-selected {
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.22),
          0 0 0 3px rgba(90,162,255,0.85),
          0 10px 24px rgba(0,0,0,0.34);
      }
      #kos-mobile-controls .kos-mc-btn.is-hidden-slot {
        opacity: 0.22 !important;
        border-style: dashed;
      }
      #kos-mobile-controls .kos-mc-btn.is-fire {
        border-color: rgba(255,150,150,0.58);
        background:
          linear-gradient(165deg, rgba(255,150,150,0.28), rgba(120,24,24,0.48)),
          radial-gradient(circle at 32% 26%, rgba(255,200,200,0.28), transparent 55%);
      }
      #kos-mobile-controls .kos-mc-btn.is-fire.is-down {
        border-color: rgba(255,180,180,0.95);
        background:
          linear-gradient(165deg, rgba(255,110,110,0.62), rgba(140,20,20,0.62)),
          radial-gradient(circle at 32% 26%, rgba(255,200,200,0.4), transparent 58%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.25),
          0 0 0 2px rgba(255,90,90,0.3),
          0 8px 20px rgba(160,30,30,0.4);
      }
      #kos-mobile-controls .kos-mc-btn.is-aim {
        border-color: rgba(160,210,255,0.5);
      }
      #kos-mobile-controls .kos-mc-btn.is-jump {
        border-color: rgba(180,255,200,0.42);
      }
      #kos-mobile-controls .kos-mc-glyph {
        position: relative;
        z-index: 1;
        width: 52%;
        height: 52%;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55));
      }
      #kos-mobile-controls .kos-mc-glyph svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      #kos-mobile-controls .kos-mc-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
        -webkit-user-drag: none;
        user-select: none;
      }
      #kos-mobile-controls .kos-mc-img.is-wide {
        width: 118%;
        height: 72%;
      }
      #kos-mobile-controls .kos-mc-btn[data-id="fire"] .kos-mc-glyph {
        width: 48%;
        height: 48%;
      }
      #kos-mobile-controls .kos-mc-btn[data-id="weapon1"] .kos-mc-glyph,
      #kos-mobile-controls .kos-mc-btn[data-id="weapon2"] .kos-mc-glyph,
      #kos-mobile-controls .kos-mc-btn[data-id="weapon3"] .kos-mc-glyph {
        width: 70%;
        height: 48%;
      }
      #kos-mobile-controls .kos-mc-fallback {
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
      }
      #kos-mobile-controls .kos-mc-label {
        position: absolute;
        left: 50%;
        bottom: -15px;
        transform: translateX(-50%);
        font-size: 10px;
        letter-spacing: 0.04em;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        text-shadow: 0 1px 2px #000;
      }
      #kos-mobile-controls.is-edit .kos-mc-label { opacity: 0.9; }
      #kos-mobile-controls .kos-mc-joy {
        border-radius: 50%;
        background:
          radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06), rgba(6,12,22,0.28) 62%),
          rgba(8,16,28,0.18);
        border: 1.5px solid rgba(255,255,255,0.24);
        box-shadow:
          inset 0 0 0 1px rgba(255,255,255,0.06),
          0 12px 28px rgba(0,0,0,0.28);
      }
      #kos-mobile-controls .kos-mc-joy.is-down {
        border-color: rgba(150,200,255,0.55);
        transform: translate(-50%, -50%);
      }
      #kos-mobile-controls .kos-mc-joy-ring {
        position: absolute; inset: 11%;
        border-radius: 50%;
        border: 1.5px solid rgba(255,255,255,0.26);
        pointer-events: none;
        box-shadow: inset 0 0 18px rgba(255,255,255,0.05);
      }
      #kos-mobile-controls .kos-mc-joy-knob {
        position: absolute;
        left: 50%; top: 50%;
        width: 40%; height: 40%;
        border-radius: 50%;
        background:
          radial-gradient(circle at 35% 28%, rgba(255,255,255,0.7), rgba(70,130,220,0.78) 58%, rgba(20,55,120,0.9));
        transform: translate(0,0);
        margin-left: -20%;
        margin-top: -20%;
        pointer-events: none;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.45),
          0 6px 14px rgba(0,0,0,0.4);
        will-change: transform;
      }
      #kos-mobile-controls .kos-mc-editbar {
        position: absolute;
        left: 50%;
        top: max(10px, env(safe-area-inset-top));
        transform: translateX(-50%);
        pointer-events: none;
        background: rgba(0,0,0,0.58);
        color: #fff;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.02em;
        border: 1px solid rgba(255,255,255,0.12);
      }
    `
    if (!style.parentElement) document.head.appendChild(style)
  }
}
