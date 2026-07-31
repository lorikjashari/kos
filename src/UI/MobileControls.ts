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

export class MobileControls {
  private root: HTMLElement | null = null
  private input: InputManager
  private settings: MobileControlsSettings
  private active = false
  private editMode = false
  private lookPointerId: number | null = null
  private lastLookX = 0
  private lastLookY = 0
  private joyPointerId: number | null = null
  private joyOriginX = 0
  private joyOriginY = 0
  private joyKnob: HTMLElement | null = null
  private dragId: MobileControlId | null = null
  private dragPointerId: number | null = null
  private dragOffsetX = 0
  private dragOffsetY = 0
  private selectedId: MobileControlId | null = null
  private onLayoutChanged: ((layout: MobileLayoutMap) => void) | null = null
  private pressed = new Set<MobileControlId>()
  private holdPointers = new Map<number, MobileControlId>()

  constructor(input: InputManager, settings?: MobileControlsSettings) {
    this.input = input
    this.settings = normalizeMobileSettings(settings)
    this.ensureStyles()
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

  private mount(): void {
    if (this.root) return
    this.root = document.createElement('div')
    this.root.id = 'kos-mobile-controls'
    this.root.innerHTML = `
      <div class="kos-mc-look" data-look="1"></div>
      <div class="kos-mc-layer" data-layer="1"></div>
      <div class="kos-mc-editbar" hidden>
        <span class="kos-mc-edit-hint">Drag buttons · tap to select · pinch scale in settings</span>
      </div>
    `
    document.body.appendChild(this.root)
    this.bindRoot()
    this.renderButtons()
  }

  private bindRoot(): void {
    if (!this.root) return
    const look = this.root.querySelector('.kos-mc-look') as HTMLElement
    look.addEventListener('pointerdown', (e) => this.onLookDown(e))
    look.addEventListener('pointermove', (e) => this.onLookMove(e))
    look.addEventListener('pointerup', (e) => this.onLookUp(e))
    look.addEventListener('pointercancel', (e) => this.onLookUp(e))

    this.root.addEventListener('pointerdown', (e) => this.onUiPointerDown(e))
    this.root.addEventListener('pointermove', (e) => this.onUiPointerMove(e))
    this.root.addEventListener('pointerup', (e) => this.onUiPointerUp(e))
    this.root.addEventListener('pointercancel', (e) => this.onUiPointerUp(e))
    this.root.addEventListener('contextmenu', (e) => e.preventDefault())
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
      const base = meta.id === 'joystick' ? 132 : meta.id === 'fire' ? 96 : 64
      const px = Math.round(base * slot.size)
      const selected = this.selectedId === meta.id ? ' is-selected' : ''
      const hidden = !slot.visible ? ' is-hidden-slot' : ''
      if (meta.id === 'joystick') {
        html.push(`
          <div class="kos-mc-btn kos-mc-joy${selected}${hidden}" data-id="joystick"
            style="left:${slot.x}%;top:${slot.y}%;width:${px}px;height:${px}px;opacity:${slot.opacity}">
            <div class="kos-mc-joy-ring"></div>
            <div class="kos-mc-joy-knob" data-knob="1"></div>
            <span class="kos-mc-label">${meta.label}</span>
          </div>`)
      } else {
        html.push(`
          <button type="button" class="kos-mc-btn${selected}${hidden}" data-id="${meta.id}"
            style="left:${slot.x}%;top:${slot.y}%;width:${px}px;height:${px}px;opacity:${slot.opacity}">
            <span class="kos-mc-glyph">${meta.glyph}</span>
            <span class="kos-mc-label">${meta.label}</span>
          </button>`)
      }
    }
    layer.innerHTML = html.join('')
    this.joyKnob = this.root.querySelector('[data-knob]') as HTMLElement | null
  }

  private onLookDown(e: PointerEvent): void {
    if (this.editMode || !this.active) return
    if ((e.target as HTMLElement).closest('[data-id]')) return
    e.preventDefault()
    this.lookPointerId = e.pointerId
    this.lastLookX = e.clientX
    this.lastLookY = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  private onLookMove(e: PointerEvent): void {
    if (this.editMode || !this.active) return
    if (this.lookPointerId !== e.pointerId) return
    const dx = e.clientX - this.lastLookX
    const dy = e.clientY - this.lastLookY
    this.lastLookX = e.clientX
    this.lastLookY = e.clientY
    const sens = this.settings.lookSensitivity
    this.input.applyLookDelta(dx * sens * 1.35, dy * sens * 1.35)
  }

  private onLookUp(e: PointerEvent): void {
    if (this.lookPointerId !== e.pointerId) return
    this.lookPointerId = null
  }

  private onUiPointerDown(e: PointerEvent): void {
    const btn = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null
    if (!btn || !this.root?.contains(btn)) return
    const id = btn.getAttribute('data-id') as MobileControlId
    e.preventDefault()
    e.stopPropagation()
    btn.setPointerCapture?.(e.pointerId)

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
    if (id === 'joystick') {
      this.joyPointerId = e.pointerId
      const rect = btn.getBoundingClientRect()
      this.joyOriginX = rect.left + rect.width / 2
      this.joyOriginY = rect.top + rect.height / 2
      this.updateJoystick(e.clientX, e.clientY, rect.width / 2)
      return
    }
    this.holdPointers.set(e.pointerId, id)
    this.press(id, true)
  }

  private onUiPointerMove(e: PointerEvent): void {
    if (this.editMode && this.dragId && this.dragPointerId === e.pointerId && this.root) {
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
      const joy = this.root?.querySelector('[data-id="joystick"]') as HTMLElement | null
      if (!joy) return
      const radius = joy.getBoundingClientRect().width / 2
      this.updateJoystick(e.clientX, e.clientY, radius)
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

    const id = this.holdPointers.get(e.pointerId)
    if (!id || id === 'joystick') return
    this.holdPointers.delete(e.pointerId)
    this.press(id, false)
  }

  private updateJoystick(x: number, y: number, radius: number): void {
    let dx = x - this.joyOriginX
    let dy = y - this.joyOriginY
    const len = Math.hypot(dx, dy) || 1
    const max = Math.max(18, radius * 0.42)
    if (len > max) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    if (this.joyKnob) {
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const nx = dx / max
    const ny = dy / max
    const dead = this.settings.joystickDeadzone
    this.input.setActionPressed(Key.Forward, ny < -dead)
    this.input.setActionPressed(Key.Backward, ny > dead)
    this.input.setActionPressed(Key.Left, nx < -dead)
    this.input.setActionPressed(Key.Right, nx > dead)
  }

  private clearJoystick(): void {
    if (this.joyKnob) this.joyKnob.style.transform = 'translate(0,0)'
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
    el?.classList.toggle('is-down', down)
  }

  private releaseAll(): void {
    for (const id of [...this.pressed]) this.press(id, false)
    this.clearJoystick()
    this.joyPointerId = null
    this.lookPointerId = null
  }

  private ensureStyles(): void {
    if (document.getElementById('kos-mc-styles')) return
    const style = document.createElement('style')
    style.id = 'kos-mc-styles'
    style.textContent = `
      #kos-mobile-controls {
        position: fixed; inset: 0; z-index: 25;
        pointer-events: none;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        display: none;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
      }
      #kos-mobile-controls.is-on { display: block; }
      #kos-mobile-controls.is-edit { z-index: 50; }
      #kos-mobile-controls .kos-mc-look {
        position: absolute; inset: 0;
        pointer-events: auto;
        touch-action: none;
      }
      #kos-mobile-controls.is-edit .kos-mc-look { pointer-events: none; background: rgba(4,10,20,0.35); }
      #kos-mobile-controls .kos-mc-layer { position: absolute; inset: 0; pointer-events: none; }
      #kos-mobile-controls .kos-mc-btn {
        position: absolute;
        transform: translate(-50%, -50%);
        border: 1.5px solid rgba(255,255,255,0.35);
        border-radius: 999px;
        background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22), rgba(10,20,40,0.45));
        color: #fff;
        pointer-events: auto;
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25), 0 8px 18px rgba(0,0,0,0.28);
        -webkit-tap-highlight-color: transparent;
      }
      #kos-mobile-controls .kos-mc-btn.is-down {
        background: radial-gradient(circle at 35% 30%, rgba(80,150,255,0.45), rgba(10,40,90,0.55));
        border-color: rgba(120,180,255,0.75);
      }
      #kos-mobile-controls .kos-mc-btn.is-selected {
        outline: 2px solid #5aa2ff;
        outline-offset: 3px;
      }
      #kos-mobile-controls .kos-mc-btn.is-hidden-slot { opacity: 0.25 !important; border-style: dashed; }
      #kos-mobile-controls .kos-mc-glyph {
        font-size: calc(18px * (var(--s, 1)));
        font-weight: 700;
        line-height: 1;
        text-shadow: 0 1px 2px rgba(0,0,0,0.55);
      }
      #kos-mobile-controls .kos-mc-label {
        position: absolute;
        left: 50%;
        bottom: -16px;
        transform: translateX(-50%);
        font-size: 10px;
        letter-spacing: 0.04em;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        text-shadow: 0 1px 2px #000;
      }
      #kos-mobile-controls.is-edit .kos-mc-label { opacity: 0.85; }
      #kos-mobile-controls .kos-mc-joy {
        border-radius: 50%;
        background: rgba(8,16,28,0.22);
        border: 1.5px solid rgba(255,255,255,0.22);
      }
      #kos-mobile-controls .kos-mc-joy-ring {
        position: absolute; inset: 10%;
        border-radius: 50%;
        border: 1.5px solid rgba(255,255,255,0.28);
        pointer-events: none;
      }
      #kos-mobile-controls .kos-mc-joy-knob {
        position: absolute;
        left: 50%; top: 50%;
        width: 38%; height: 38%;
        margin: 0;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), rgba(40,90,180,0.65));
        transform: translate(0,0);
        margin-left: -19%;
        margin-top: -19%;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      }
      #kos-mobile-controls .kos-mc-editbar {
        position: absolute;
        left: 50%;
        top: max(10px, env(safe-area-inset-top));
        transform: translateX(-50%);
        pointer-events: none;
        background: rgba(0,0,0,0.55);
        color: #fff;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.02em;
      }
      #kos-mobile-controls [data-id="fire"] {
        background: radial-gradient(circle at 35% 30%, rgba(255,120,120,0.35), rgba(90,20,20,0.5));
        border-color: rgba(255,140,140,0.55);
      }
    `
    document.head.appendChild(style)
  }
}
