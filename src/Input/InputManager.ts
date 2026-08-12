import * as THREE from 'three'
import { IUpdatable } from '../Interface/IUpdatable'
import { Game } from '../Game'
import { Key, KeyBinding } from './KeyBinding'
import { PlayerWrapper } from '../Core/PlayerWrapper'
import { Vector3D } from '../Core/Vector'
import { PlayerRenderer } from '../View/Renderer/PlayerRenderer/PlayerRenderer'
import { FPSRenderer } from '../View/Renderer/PlayerRenderer/FPSRenderer'
import { FPSCameraManager } from '../View/CameraManager/FPSCameraManager'
import { CameraManager } from '../View/CameraManager/CameraManager'
import { DEFAULT_KEYBINDS, type KeybindMap } from '../UI/SettingsStore'
import { mapHasButterflyKnife } from '../Core/MapCatalog'

export class InputManager implements IUpdatable {
  public keys: Map<Key, KeyBinding> = new Map<Key, KeyBinding>()
  public boundOnKeyDown: (evt: any) => void
  public boundOnKeyUp: (evt: any) => void
  public boundOnMouseDown: (evt: any) => void
  public boundOnMouseUp: (evt: any) => void

  public boundOnMouseMove: (evt: any) => void
  public boundOnPointerlockChange: (evt: any) => void
  public boundOnPointerlockError: (evt: any) => void
  public boundOnPointerlock: (evt: any) => void
  public boundOnWheel: (evt: WheelEvent) => void
  private isLocked: boolean = false
  /** When false, ignore gameplay input / pointer lock (menu open) */
  public gameplayEnabled = false
  public jumpWithScrollWheel = true
  public mobileMode = false
  private moveAnalog = 1
  private playerWrapper!: PlayerWrapper
  private footstepTimer = 0
  private emptyClickCooldown = 0
  private pendingScrollJumps = 0
  private jumpBufferMs = 0
  private readonly jumpBufferDuration = 130
  private codeToAction = new Map<string, Key>()

  constructor() {
    for (const k in Key) {
      if (isNaN(Number(k))) {
        const key: Key = Key[k as keyof typeof Key]
        this.keys.set(key, new KeyBinding(key))
      }
    }
    this.applyKeybinds(DEFAULT_KEYBINDS)

    this.boundOnKeyDown = (evt) => this.onKeyDown(evt)
    this.boundOnKeyUp = (evt) => this.onKeyUp(evt)
    this.boundOnMouseDown = (evt) => this.onMouseDown(evt)
    this.boundOnMouseUp = (evt) => this.onMouseUp(evt)
    this.boundOnMouseMove = (evt) => this.onMouseMove(evt)
    this.boundOnPointerlockChange = (evt) => this.onPointerlockChange(evt)
    this.boundOnPointerlockError = (evt) => this.onPointerlockError(evt)
    this.boundOnPointerlock = (evt) => this.onLock(evt)
    this.boundOnWheel = (evt) => this.onWheel(evt)

    document.body.ownerDocument.addEventListener('keydown', this.boundOnKeyDown, false)
    document.body.ownerDocument.addEventListener('keyup', this.boundOnKeyUp, false)
    document.body.ownerDocument.addEventListener('mousedown', this.boundOnMouseDown, false)
    document.body.ownerDocument.addEventListener('mouseup', this.boundOnMouseUp, false)

    document.body.ownerDocument.addEventListener('mousemove', this.boundOnMouseMove, false)
    document.body.ownerDocument.addEventListener('wheel', this.boundOnWheel, { passive: false, capture: true })
    document.body.ownerDocument.addEventListener('pointerlockchange', this.boundOnPointerlockChange, false)
    document.body.ownerDocument.addEventListener('pointerlockerror', this.boundOnPointerlockError, false)
    document.body.ownerDocument.addEventListener('click', this.boundOnPointerlock, false)
    document.body.ownerDocument.addEventListener('contextmenu', (evt) => evt.preventDefault(), false)
  }

  public applyKeybinds(binds: KeybindMap): void {
    this.codeToAction.clear()
    const merged = { ...DEFAULT_KEYBINDS, ...binds }
    // Pass 1: movement / jump / actions (never let 1/2/3 steal Space)
    const weapons = new Set<Key>([Key.One, Key.Two, Key.Three, Key.Four])
    for (const [action, code] of Object.entries(merged)) {
      if (!code) continue
      const act = action as Key
      if (weapons.has(act)) continue
      this.codeToAction.set(code.toLowerCase(), act)
    }
    // Pass 2: weapons only on free codes (fall back to defaults if stolen)
    for (const act of [Key.One, Key.Two, Key.Three, Key.Four]) {
      const wanted = (merged[act] || DEFAULT_KEYBINDS[act]).toLowerCase()
      const taken = this.codeToAction.has(wanted)
      const code = taken ? DEFAULT_KEYBINDS[act].toLowerCase() : wanted
      if (!this.codeToAction.has(code)) this.codeToAction.set(code, act)
    }
  }

  public setJumpWithScrollWheel(enabled: boolean): void {
    this.jumpWithScrollWheel = !!enabled
  }

  public setSensitivity(value: number): void {
    CameraManager.mouseSensitivity = Math.max(0.01, Math.min(20, value))
  }

  public getSensitivity(): number {
    return CameraManager.mouseSensitivity
  }

  public setMobileMode(enabled: boolean): void {
    this.mobileMode = !!enabled
    if (this.mobileMode) this.unlock()
    else this.moveAnalog = 1
  }

  /** Stick magnitude 0..1 — near center walks, full push runs. */
  public setMoveAnalog(amount: number): void {
    this.moveAnalog = Math.max(0, Math.min(1, amount))
  }

  public setActionPressed(action: Key, pressed: boolean): void {
    const binding = this.keys.get(action)
    if (!binding) return
    if (pressed) {
      if (!binding.isPressed) binding.setPressed(true)
      else binding.isPressed = true
    } else if (binding.isPressed) {
      binding.onKeyUp()
    }
  }

  public applyLookDelta(dx: number, dy: number): void {
    if (!this.gameplayEnabled || !this.playerWrapper?.player.isCurrentPlayer) return
    if (this.playerWrapper.player.isDead) return
    this.playerWrapper.cameraManager?.onMouseMove({ movementX: dx, movementY: dy })
  }

  private normalizeKey(event: KeyboardEvent): string {
    if (event.key === ' ') return ' '
    return event.key.toLowerCase()
  }

  onLock(event?: MouseEvent): void {
    if (!this.gameplayEnabled || this.mobileMode) return
    if (event && this.clickedOnHud(event)) return
    const el = document.body as HTMLElement & {
      requestPointerLock?: () => void
      webkitRequestPointerLock?: () => void
    }
    const req = el.requestPointerLock || el.webkitRequestPointerLock
    if (typeof req === 'function') {
      try {
        req.call(el)
      } catch {
        /* unsupported */
      }
    }
  }
  unlock(): void {
    this.isLocked = false
    const doc = document as Document & {
      exitPointerLock?: () => void
      webkitExitPointerLock?: () => void
    }
    const exit = doc.exitPointerLock || doc.webkitExitPointerLock
    if (typeof exit === 'function') {
      try {
        exit.call(doc)
      } catch {
        /* unsupported on iOS / some mobile browsers */
      }
    }
  }
  onPointerlockError(_evt: any): void {
    this.isLocked = false
  }
  onPointerlockChange(_evt: any): void {
    const doc = document as Document & { pointerLockElement?: Element | null }
    this.isLocked = doc.pointerLockElement === document.body
  }
  onMouseMove(evt: any): void {
    if (!this.gameplayEnabled || !this.playerWrapper?.player.isCurrentPlayer) return
    if (!this.mobileMode && this.isLocked === false) return
    if (this.mobileMode) return
    this.playerWrapper.cameraManager!.onMouseMove(evt)
  }

  private isMoving(): boolean {
    return !!(
      this.keys.get(Key.Forward)?.isPressed ||
      this.keys.get(Key.Backward)?.isPressed ||
      this.keys.get(Key.Left)?.isPressed ||
      this.keys.get(Key.Right)?.isPressed
    )
  }

  private updateFootsteps(dt: number): void {
    const player = this.playerWrapper.player
    if (this.mobileMode) {
      player.setWalking(false)
      player.setMoveIntentScale(this.isMoving() ? Math.max(0.28, this.moveAnalog) : 1)
    } else {
      player.setWalking(!!this.keys.get(Key.Shift)?.isPressed)
      player.setMoveIntentScale(1)
    }

    if (!player.isOnGround || !this.isMoving()) {
      this.footstepTimer = 0
      return
    }

    const speedFactor = this.mobileMode
      ? Math.max(0.35, this.moveAnalog)
      : player.isWalking
        ? 0.55
        : 1
    const interval = player.isCrouching ? 0.55 : 0.34 / speedFactor
    this.footstepTimer += dt
    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0
      const volume = player.isCrouching ? 0.35 : 0.45 + 0.55 * speedFactor
      void Game.getInstance().audioManager.playFootstep(volume)
    }
  }

  update(dt: number): void {
    if (!this.gameplayEnabled || !this.playerWrapper) {
      this.resetAllEdges()
      return
    }

    const playerController = this.playerWrapper.controller
    const playerRenderer = this.playerWrapper.renderer as PlayerRenderer
    const player = this.playerWrapper.player

    this.emptyClickCooldown = Math.max(0, this.emptyClickCooldown - dt)

    if (player.isDead) {
      this.resetAllEdges()
      return
    }

    const game = Game.getInstance()

    // Loadout pick must run BEFORE the pre-combat lockdown return — otherwise
    // 1/2 never confirm and combatLive stays false (connected but frozen).
    if (game.isAwaitingLoadout()) {
      if (this.keys.get(Key.One)?.justReleased) game.confirmMatchLoadout('AWP')
      else if (this.keys.get(Key.Two)?.justReleased) game.confirmMatchLoadout('AK47')
      this.resetAllEdges()
      return
    }

    // Pre-round lockdown: look around only — no move / shoot
    if (game.matchStarted && !game.isCombatLive()) {
      this.resetAllEdges()
      return
    }

    player.setCrouching(!!this.keys.get(Key.Crouch)?.isPressed)
    this.updateFootsteps(dt)

    // PC: one jump per press (short buffer for pre-landing bhop timing).
    // Mobile: hold jump to auto-bhop on every landing.
    if (this.mobileMode && this.keys.get(Key.Jump)?.isPressed) {
      this.jumpBufferMs = this.jumpBufferDuration
    } else if (this.keys.get(Key.Jump)?.justPressed) {
      this.jumpBufferMs = this.jumpBufferDuration
    }
    if (this.jumpBufferMs > 0) {
      if (this.tryJump()) this.jumpBufferMs = 0
      else this.jumpBufferMs = Math.max(0, this.jumpBufferMs - dt * 1000)
    }
    // Scroll-wheel jump (mwheelup / mwheeldown)
    while (this.pendingScrollJumps > 0) {
      this.pendingScrollJumps--
      if (this.tryJump()) break
    }
    if (this.keys.get(Key.Forward)?.isPressed) {
      playerController.moveForward(0, dt)
      playerRenderer?.handleMove(new Vector3D(0, 0, -1), dt)
    }
    if (this.keys.get(Key.Backward)?.isPressed) {
      playerController.moveBackward(0, dt)
      playerRenderer?.handleMove(new Vector3D(0, 0, 1), dt)
    }
    if (this.keys.get(Key.Left)?.isPressed) {
      playerController.moveLeft(0, dt)
      playerRenderer?.handleMove(new Vector3D(-1, 0, 0), dt)
    }
    if (this.keys.get(Key.Right)?.isPressed) {
      playerController.moveRight(0, dt)
      playerRenderer?.handleMove(new Vector3D(1, 0, 0), dt)
    }

    if (this.playerWrapper.cameraManager instanceof FPSCameraManager) {
      let leanDirection = 0
      if (this.keys.get(Key.LeanLeft)?.isPressed) leanDirection = 1
      if (this.keys.get(Key.LeanRight)?.isPressed) leanDirection = -1
      this.playerWrapper.cameraManager.setLeanDirection(leanDirection)
    }

    // 1 = match primary (AK or AWP), 2 = USP, 3 = knife
    const fps = playerRenderer as FPSRenderer | undefined
    const equip = (viewKey: string, logicKey: string) => {
      if (game.editorActive) {
        const ed =
          viewKey === 'AK47' || viewKey === 'AK'
            ? 'AK'
            : viewKey === 'Butterfly' || viewKey === 'Knife'
              ? 'Butterfly'
              : viewKey === 'AWP'
                ? 'AWP'
                : 'Usp'
        fps?.equipEditorWeapon(ed)
        void game.audioManager.playSwitch(logicKey === 'Butterfly' ? 'Knife' : logicKey)
        return
      }
      // Already holding this slot — ignore so 1/2/3 don't re-draw
      if (player.currentWeapon.key === logicKey) return
      if (player.setWeapon(logicKey)) {
        fps?.equipWeaponMesh(logicKey)
        void game.audioManager.playSwitch(logicKey === 'Butterfly' ? 'Knife' : logicKey)
      }
    }

    if (this.keys.get(Key.One)?.justReleased) {
      const primary = player.primaryWeaponKey
      equip(primary, primary)
    } else if (this.keys.get(Key.Two)?.justReleased) {
      equip('Usp', 'Usp')
    }

    if (this.keys.get(Key.Three)?.justReleased) {
      const butterfly = mapHasButterflyKnife(game.activeMapId)
      equip(butterfly ? 'Butterfly' : 'Knife', butterfly ? 'Butterfly' : 'Knife')
    }

    if (this.playerWrapper.cameraManager instanceof FPSCameraManager) {
      player.lookingDirection = this.playerWrapper.cameraManager.getDirection()
    }

    const fireMode = player.currentWeapon.fireMode
    const leftClick = this.keys.get(Key.Left_Click)
    const wantsToFire = fireMode === 'auto' ? !!leftClick?.isPressed : !!leftClick?.justPressed

    if (wantsToFire) {
      if (player.currentWeapon.fireMode !== 'melee' && player.ammoInMag <= 0 && !player.isReloading) {
        if (player.tryAutoReload()) {
          playerRenderer?.handleReload()
          void Game.getInstance().audioManager.playReload(player.currentWeapon.key)
        } else if (this.emptyClickCooldown <= 0 && leftClick?.justPressed) {
          void Game.getInstance().audioManager.playEmpty(player.currentWeapon.key)
          this.emptyClickCooldown = 0.2
        }
      } else {
        const hitScanResult = playerController.shoot()
        if (hitScanResult) {
          playerRenderer?.handleShoot(hitScanResult)
          if (player.ammoInMag <= 0 && player.tryAutoReload()) {
            playerRenderer?.handleReload()
            void Game.getInstance().audioManager.playReload(player.currentWeapon.key)
          }
        }
      }
    }

    if (this.keys.get(Key.Reload)?.justReleased) {
      if (player.startReload()) {
        playerRenderer?.handleReload()
        void Game.getInstance().audioManager.playReload(player.currentWeapon.key)
      }
    }

    if (this.keys.get(Key.Right_Click)?.justReleased) {
      if (player.currentWeapon.key === 'AWP') {
        playerRenderer?.handleZoom()
      }
    }

    if (this.keys.get(Key.SwitchHands)?.justReleased) {
      if (playerRenderer instanceof FPSRenderer) {
        playerRenderer.toggleHands()
      }
    }
    this.resetAllEdges()
  }

  private resetAllEdges(): void {
    for (const k in Key) {
      if (isNaN(Number(k))) {
        const key: Key = Key[k as keyof typeof Key]
        this.keys.get(key)?.resetRelease()
      }
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    this.blockBrowserShortcut(event)

    if (event.key === 'Tab') {
      event.preventDefault()
      if (!event.repeat && this.gameplayEnabled) {
        Game.getInstance().renderer?.hud?.setScoreboardVisible(true)
      }
      return
    }

    // CS-style console: backtick (`) toggles open/closed, slash also opens. Works from menu or in-match.
    if (
      (event.code === 'Backquote' || event.key === '`' || event.key === '~' || event.key === '/') &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      event.preventDefault()
      Game.getInstance().toggleCommandConsole()
      return
    }

    if (!this.gameplayEnabled) return
    // Keep Space from scrolling the page while playing
    if (event.code === 'Space' || event.key === ' ') event.preventDefault()
    const code = this.normalizeKey(event)
    const action = this.codeToAction.get(code)
    if (action && action !== Key.Left_Click && action !== Key.Right_Click) {
      this.keys.get(action)?.setPressed(true)
    }
  }

  /**
   * Cancel the browser's own shortcuts (save, bookmark, find, print, reload, history)
   * without consuming the key — the press still reaches the gameplay bindings, so a
   * key bound to Ctrl keeps working and Ctrl+W still walks forward while crouched.
   * Ctrl+W / Ctrl+N / Ctrl+T are reserved by the browser and may still close or open a tab.
   */
  private blockBrowserShortcut(event: KeyboardEvent): void {
    if (!this.gameplayEnabled) return
    if (Game.getInstance().isCommandConsoleOpen()) return
    const tag = (event.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    // A bare modifier press is never a shortcut and may be bound to crouch / walk
    if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
      return
    }

    // Leave the browser's own window controls alone
    if (event.key === 'F11' || event.key === 'F12') return

    if (event.ctrlKey || event.metaKey || event.altKey || /^F\d{1,2}$/.test(event.key)) {
      event.preventDefault()
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault()
      Game.getInstance().renderer?.hud?.setScoreboardVisible(false)
      return
    }

    if (!this.gameplayEnabled) return
    const code = this.normalizeKey(event)
    const action = this.codeToAction.get(code)
    if (action && action !== Key.Left_Click && action !== Key.Right_Click) {
      this.keys.get(action)?.onKeyUp()
    }
  }

  clickedOnHud(event: MouseEvent): boolean {
    const menu = document.getElementById('kos-menu')
    if (menu && !menu.classList.contains('is-hidden')) return true
    if (document.getElementById('kos-pwa-gate')) return true
    if (Game.getInstance().isCommandConsoleOpen()) return true
    const target = event.target as HTMLElement
    if (target?.closest?.('#kos-editor')) return true
    if (target?.closest?.('#kos-mobile-controls')) return true
    if (target?.closest?.('#game-hud-top')) return true
    if (target.nodeName === 'BODY' || target.nodeName === 'CANVAS') return false
    return !!target.closest('.cs-pause-btn, .cs-pause-panel, .cs-pause-menu, .cs-console-btn, .cs-loadout, #kos-con, #kos-editor')
  }

  onMouseDown(event: MouseEvent): void {
    if (!this.gameplayEnabled || this.mobileMode) return
    if (this.clickedOnHud(event)) return
    const action = this.codeToAction.get(`mouse${event.button}`)
    if (action) this.keys.get(action)?.setPressed(true)
    else {
      if (event.button === 0) this.keys.get(Key.Left_Click)?.setPressed(true)
      if (event.button === 2) this.keys.get(Key.Right_Click)?.setPressed(true)
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (!this.gameplayEnabled || this.mobileMode) return
    if (this.clickedOnHud(event)) return
    const action = this.codeToAction.get(`mouse${event.button}`)
    if (action) this.keys.get(action)?.onKeyUp()
    else {
      if (event.button === 0) this.keys.get(Key.Left_Click)?.onKeyUp()
      if (event.button === 2) this.keys.get(Key.Right_Click)?.onKeyUp()
    }
  }

  private onWheel(event: WheelEvent): void {
    if (event.deltaY === 0 && event.deltaX === 0) return
    try {
      const game = Game.getInstance()
      if (game.isSpectating()) {
        event.preventDefault()
        game.cycleSpectate(event.deltaY > 0 ? 1 : -1)
        return
      }
    } catch {
      /* boot */
    }
    if (!this.jumpWithScrollWheel) return
    if (!this.gameplayEnabled) return
    if (!this.playerWrapper?.player || this.playerWrapper.player.isDead) return
    if (Game.getInstance().matchStarted && !Game.getInstance().isCombatLive()) return
    // Any scroll tick (up or down) = one jump attempt
    event.preventDefault()
    this.pendingScrollJumps = Math.min(this.pendingScrollJumps + 1, 3)
  }

  private tryJump(): boolean {
    if (!this.playerWrapper) return false
    const playerController = this.playerWrapper.controller
    const playerRenderer = this.playerWrapper.renderer as PlayerRenderer
    if (playerController.jump()) {
      playerRenderer?.handleJump()
      void Game.getInstance().audioManager.playJump()
      return true
    }
    return false
  }

  setCurrentPlayer(playerWrapper: PlayerWrapper): void {
    this.playerWrapper = playerWrapper
  }
}
