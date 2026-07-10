import * as THREE from 'three'
import { IUpdatable } from '../Interface/IUpdatable'
import { Game } from '../Game'
import { Key, KeyBinding } from './KeyBinding'
import { PlayerWrapper } from '../Core/PlayerWrapper'
import { Vector3D } from '../Core/Vector'
import { PlayerRenderer } from '../View/Renderer/PlayerRenderer/PlayerRenderer'
import { FPSRenderer } from '../View/Renderer/PlayerRenderer/FPSRenderer'
import { FPSCameraManager } from '../View/CameraManager/FPSCameraManager'
import { DEFAULT_KEYBINDS, type KeybindMap } from '../UI/SettingsStore'

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
  private isLocked: boolean = false
  /** When false, ignore gameplay input / pointer lock (menu open) */
  public gameplayEnabled = false

  private playerWrapper!: PlayerWrapper
  private footstepTimer = 0
  private emptyClickCooldown = 0
  /** event.key (lower) or mouseN → Key */
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

    document.body.ownerDocument.addEventListener('keydown', this.boundOnKeyDown, false)
    document.body.ownerDocument.addEventListener('keyup', this.boundOnKeyUp, false)
    document.body.ownerDocument.addEventListener('mousedown', this.boundOnMouseDown, false)
    document.body.ownerDocument.addEventListener('mouseup', this.boundOnMouseUp, false)

    document.body.ownerDocument.addEventListener('mousemove', this.boundOnMouseMove, false)
    document.body.ownerDocument.addEventListener('pointerlockchange', this.boundOnPointerlockChange, false)
    document.body.ownerDocument.addEventListener('pointerlockerror', this.boundOnPointerlockError, false)
    document.body.ownerDocument.addEventListener('click', this.boundOnPointerlock, false)
    document.body.ownerDocument.addEventListener('contextmenu', (evt) => evt.preventDefault(), false)
  }

  public applyKeybinds(binds: KeybindMap): void {
    this.codeToAction.clear()
    const merged = { ...DEFAULT_KEYBINDS, ...binds }
    for (const [action, code] of Object.entries(merged)) {
      if (!code) continue
      this.codeToAction.set(code.toLowerCase(), action as Key)
    }
  }

  private normalizeKey(event: KeyboardEvent): string {
    if (event.key === ' ') return ' '
    return event.key.toLowerCase()
  }

  onLock(event?: MouseEvent): void {
    if (!this.gameplayEnabled) return
    if (event && this.clickedOnHud(event)) return
    document.body.requestPointerLock()
  }
  unlock(): void {
    document.body.ownerDocument.exitPointerLock()
  }
  onPointerlockError(_evt: any): void {
    console.error('THREE.PointerLockControls: Unable to use Pointer Lock API')
  }
  onPointerlockChange(_evt: any): void {
    this.isLocked = document.body.ownerDocument.pointerLockElement === document.body
  }
  onMouseMove(evt: any): void {
    if (!this.gameplayEnabled || this.isLocked === false || !this.playerWrapper?.player.isCurrentPlayer) return
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
    const walking = !!this.keys.get(Key.Shift)?.isPressed
    player.setWalking(walking)

    if (!player.isOnGround || !this.isMoving() || walking) {
      this.footstepTimer = 0
      return
    }

    const interval = player.isCrouching ? 0.55 : 0.34
    this.footstepTimer += dt
    if (this.footstepTimer >= interval) {
      this.footstepTimer = 0
      const volume = player.isCrouching ? 0.35 : 1
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

    // Pre-round lockdown: look around only — no move / shoot
    if (Game.getInstance().matchStarted && !Game.getInstance().isCombatLive()) {
      this.resetAllEdges()
      return
    }

    player.setCrouching(!!this.keys.get(Key.Crouch)?.isPressed)
    this.updateFootsteps(dt)

    if (this.keys.get(Key.Jump)?.isPressed) {
      if (playerController.jump()) {
        playerRenderer!.handleJump()
        void Game.getInstance().audioManager.playJump()
      }
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

    if (this.keys.get(Key.One)?.justReleased) {
      if (player.setWeapon('AK47')) {
        ;(playerRenderer as FPSRenderer | undefined)?.equipWeaponMesh('AK47')
        void Game.getInstance().audioManager.playSwitch('AK47')
      }
    }
    if (this.keys.get(Key.Two)?.justReleased) {
      if (player.setWeapon('Usp')) {
        ;(playerRenderer as FPSRenderer | undefined)?.equipWeaponMesh('Usp')
        void Game.getInstance().audioManager.playSwitch('Usp')
      }
    }

    if (this.keys.get(Key.Three)?.justReleased) {
      if (player.setWeapon('Knife')) {
        ;(playerRenderer as FPSRenderer | undefined)?.equipWeaponMesh('Knife')
        void Game.getInstance().audioManager.playSwitch('Knife')
      }
    }

    // Key.Four kept for optional FPS re-focus (no TPS)
    if (this.keys.get(Key.Four)?.justReleased) {
      if (this.playerWrapper.switchToFpsView()) {
        this.playerWrapper.cameraManager = new FPSCameraManager(
          this.playerWrapper.player,
          this.playerWrapper.renderer!.camera
        )
        Game.getInstance().renderer.setCamera(this.playerWrapper.cameraManager!.camera)
        this.playerWrapper.renderer?.setCameraManager(this.playerWrapper.cameraManager)
      }
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
      playerRenderer?.handleZoom()
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
    if (event.key === 'Tab') {
      event.preventDefault()
      if (!event.repeat && this.gameplayEnabled) {
        Game.getInstance().renderer?.hud?.setScoreboardVisible(true)
      }
      return
    }

    if (!this.gameplayEnabled) return
    const code = this.normalizeKey(event)
    const action = this.codeToAction.get(code)
    if (action && action !== Key.Left_Click && action !== Key.Right_Click) {
      this.keys.get(action)?.setPressed(true)
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
    const target = event.target as HTMLElement
    if (target.nodeName === 'BODY' || target.nodeName === 'CANVAS') return false
    // Only treat interactive HUD chrome as blocking (pause button / panel)
    return !!target.closest('.cs-pause-btn, .cs-pause-panel, .cs-pause-menu')
  }

  onMouseDown(event: MouseEvent): void {
    if (!this.gameplayEnabled) return
    if (this.clickedOnHud(event)) return
    const action = this.codeToAction.get(`mouse${event.button}`)
    if (action) this.keys.get(action)?.setPressed(true)
    else {
      if (event.button === 0) this.keys.get(Key.Left_Click)?.setPressed(true)
      if (event.button === 2) this.keys.get(Key.Right_Click)?.setPressed(true)
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (!this.gameplayEnabled) return
    if (this.clickedOnHud(event)) return
    const action = this.codeToAction.get(`mouse${event.button}`)
    if (action) this.keys.get(action)?.onKeyUp()
    else {
      if (event.button === 0) this.keys.get(Key.Left_Click)?.onKeyUp()
      if (event.button === 2) this.keys.get(Key.Right_Click)?.onKeyUp()
    }
  }

  setCurrentPlayer(playerWrapper: PlayerWrapper): void {
    this.playerWrapper = playerWrapper
  }
}
