import { IUpdatable } from '../../../Interface/IUpdatable'
import { Key } from '../../../Input/KeyBinding'
import * as THREE from 'three'
import { FPSMesh } from '../../Mesh/FPSMesh'
import ParticleSystem, {
  Alpha,
  Position,
  Body,
  Color,
  CrossZone,
  Emitter,
  Force,
  Life,
  Gravity,
  ease,
  Mass,
  RadialVelocity,
  RandomDrift,
  Radius,
  Rate,
  Scale,
  Rotate,
  ScreenZone,
  Span,
  SpriteRenderer,
  Vector3D as NebulaVector3D,
} from 'three-nebula'
import { DebugUI } from '../../DebugUI'
import { LoadableMesh } from '../../Mesh/LoadableMesh'
import { Player } from '../../../Core/Player'
import { HitscanResult } from '../../../Interface/utils'
import { PlayerRenderer } from './PlayerRenderer'
import { Vector2D, Vector3D } from '../../../Core/Vector'
import { Game } from '../../../Game'
import { FPSCameraManager } from '../../CameraManager/FPSCameraManager'
import { CameraManager } from '../../CameraManager/CameraManager'
import { lerp } from '../../../Core/MathUtils'

// TODO: cette classe gère le mouvement de la FPS Mesh
export class FPSRenderer extends PlayerRenderer implements IUpdatable {
  public handleJump(): void {}
  protected removeMesh(): void {
    // Keep viewmodel lights alive across weapon switches
    for (const light of this.viewmodelLights) {
      light.parent?.remove(light)
    }
    while (this.viewmodelCamera.children.length > 0) {
      this.viewmodelCamera.remove(this.viewmodelCamera.children[0])
    }
  }
  show(): void {
    if (this.scopeLevel > 0) return
    this.fpsMesh.mesh.visible = true
  }
  hide(): void {
    this.fpsMesh.mesh.visible = false
  }
  // Left click given by InputManager
  public handleShoot(hitscanResult: HitscanResult): void {
    const scopedAwp = this.player.currentWeapon.key === 'AWP' && this.scopeLevel > 0
    const rezoomLevel = this.scopeLevel
    super.handleShoot(hitscanResult)
    const key = this.player.currentWeapon.key
    const isMelee = this.player.currentWeapon.fireMode === 'melee'
    if (key === 'AWP') {
      this.fpsMesh.playAnimation('Shoot', false, true, 1.05)
      this.recoilEffect = 0.24
      this.recoilRecover = 1.35
      this.weaponBobbingAcc.x += 0.042
      this.weaponBobbingAcc.y += (Math.random() - 0.5) * 0.028
      this.weaponBobbingAcc.z += 0.012
    } else if (key === 'AK47') {
      this.fpsMesh.playAnimation('Shoot', false, true, 1.85)
      this.recoilEffect = 0.13
      this.recoilRecover = 3.4
      this.weaponBobbingAcc.x += 0.016
      this.weaponBobbingAcc.y += (Math.random() - 0.5) * 0.012
      this.weaponBobbingAcc.z += 0.008
    } else {
      this.fpsMesh.playAnimation('Shoot', false, true, 1.55)
      this.recoilEffect = isMelee ? 0.06 : 0.11
      this.recoilRecover = 2.4
    }
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.createRecoil()
    }
    if (!isMelee) {
      this.tempEmitter.setRate(new Rate(1, this.playerCameraManager.player.rateOfFire / 1000))
      this.tempEmitter.emit()
      setTimeout(() => {
        this.tempEmitter.setRate(new Rate(0, 0))
      }, this.playerCameraManager.player.rateOfFire)
    }
    if (scopedAwp && rezoomLevel > 0) {
      this.beginScopedBoltCycle(rezoomLevel as 1 | 2)
    }
    const shootScale = key === 'AWP' ? 1.05 : key === 'AK47' ? 1.85 : 1.55
    this.scheduleIdleReturn('Shoot', shootScale)
  }

  public handleReload(): void {
    this.clearScope(false)
    const meshKey = this.fpsMesh?.key
    const scale = this.player.currentWeapon.key === 'AWP' ? 1.35 : 1.55
    this.fpsMesh.playAnimation('Reload', false, true, scale)
    this.locomotionBusyUntil = performance.now() + 3200
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.resetRecoil()
    }
    const rel = this.fpsMesh.animations.get('Reload')
    if (rel?.Start && rel?.End && this.fpsMesh.animations.has('Idle')) {
      const durSec = Math.max(0.2, (rel.End.time - Math.abs(rel.Start.time)) / scale)
      this.locomotionBusyUntil = performance.now() + durSec * 1000 + 80
      window.setTimeout(() => {
        if (this.fpsMesh?.key === meshKey && this.fpsMesh.animations.has('Idle')) {
          this.fpsMesh.playAnimation('Idle', true, true, 1.0)
        }
      }, durSec * 1000 + 40)
    }
  }

  public handleWeaponSwitch(): void {
    this.clearScope(false)
    this.switchVelocity = 0.05
    const meshKey = this.fpsMesh?.key
    const key = this.fpsMesh?.key
    const scale = key === 'AWP' ? 1.25 : key === 'AK47' ? 1.45 : 1.5
    this.fpsMesh.playAnimation('Switch', false, true, scale)
    this.weaponBobbingAcc.x += 0.02
    this.weaponBobbingAcc.y -= 0.03
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.resetRecoil()
    }
    const sw = this.fpsMesh.animations.get('Switch')
    if (sw?.Start && sw?.End && this.fpsMesh.animations.has('Idle')) {
      const durSec = Math.max(0.2, (sw.End.time - Math.abs(sw.Start.time)) / scale)
      this.locomotionBusyUntil = performance.now() + durSec * 1000 + 80
      window.setTimeout(() => {
        if (this.fpsMesh?.key === meshKey && this.fpsMesh.animations.has('Idle')) {
          this.fpsMesh.playAnimation('Idle', true, true, 1.0)
        }
      }, durSec * 1000 + 40)
    }
  }

  private scheduleIdleReturn(fromAnim: string, timeScale: number): void {
    const meshKey = this.fpsMesh?.key
    const clip = this.fpsMesh.animations.get(fromAnim)
    if (!clip?.Start || !clip?.End || !this.fpsMesh.animations.has('Idle')) return
    const durSec = Math.max(0.12, (clip.End.time - Math.abs(clip.Start.time)) / timeScale)
    this.locomotionBusyUntil = Math.max(this.locomotionBusyUntil, performance.now() + durSec * 1000)
    window.setTimeout(() => {
      if (this.fpsMesh?.key !== meshKey) return
      if (this.scopeLevel > 0) return
      const cur = this.fpsMesh.getCurrentAnimName()
      if (cur === 'Reload' || cur === 'Switch') return
      this.fpsMesh.playAnimation('Idle', true, true, 1.0)
    }, durSec * 1000 + 30)
  }

  private updateLocomotionAnim(): void {
    if (!this.fpsMesh?.animations.has('Move')) return
    if (this.scopeLevel > 0) return
    if (performance.now() < this.locomotionBusyUntil) return
    const cur = this.fpsMesh.getCurrentAnimName()
    if (cur === 'Shoot' || cur === 'Reload' || cur === 'Switch') return
    const spd = Math.hypot(this.player.velocity.x, this.player.velocity.z)
    const moving = this.player.isOnGround && spd > 1.2
    if (moving) {
      if (cur !== 'Move') this.fpsMesh.playAnimation('Move', true, true, 1.25)
    } else if (cur === 'Move' || cur === '') {
      this.fpsMesh.playAnimation('Idle', true, true, 1.0)
    }
  }
  private switchVelocity = 0
  private viewmodelCamera: THREE.PerspectiveCamera
  public fpsMesh!: FPSMesh
  private recoilEffect = 0
  private recoilRecover = 2.5
  private idleSwayTime = 0
  private locomotionBusyUntil = 0
  /** 0 hipfire, 1 first zoom, 2 second zoom — AWP only */
  private scopeLevel = 0
  private pendingRezoomLevel = 0
  private boltCycleToken = 0
  private scopeOverlay: HTMLElement | null = null
  private targetFov = 80
  private static readonly SCOPE_FOVS = [38, 12] as const
  private static readonly FOV_LERP_IN = 12
  private static readonly FOV_LERP_OUT = 16

  public isScoped(): boolean {
    return this.scopeLevel > 0
  }

  public getScopeLevel(): number {
    return this.scopeLevel
  }

  private bobbingAmount = 0.0008
  private bobbingRestitutionSpeed = 15
  private moveEffect = Vector3D.ZERO()
  private tempEmitter: Emitter
  public weaponOffset = Vector3D.ZERO()
  public weaponRotation = Vector3D.ZERO()
  private viewmodelLights: THREE.Light[] = []
  private weaponBobbingAcc = Vector3D.ZERO()
  /** 1 = right hand (default), -1 = left hand */
  private handSide: 1 | -1 = 1
  private baseViewScale = new THREE.Vector3(-1, -1, -1)
  /** One ready viewmodel per weapon — never clone mid-match */
  private weaponCache = new Map<string, FPSMesh>()
  private shellTextureReady: Promise<void> | null = null

  constructor(player: Player) {
    super(player)
    // Always use the overlay viewmodel camera so the gun never depth-tests against walls
    this.viewmodelCamera = this.game.renderer.viewmodelRenderer.camera
    this.createViewmodelLights()
    this.initParticleEmitter()
    this.equipWeaponMesh('AK47', false)
    player.setWeapon('AK47')
    this.setFov(this.baseFov)
    if (this.showDebug) {
      const debugUI: DebugUI = this.game.renderer.debugUI

      const positionFolder = debugUI.addVector(this.weaponOffset, 'Viewmodel Offset', new Vector3D(2, 4, 2), 0.01)
      const rotationFolder = debugUI.addVector(
        this.weaponRotation,
        'Viewmodel Rotation',
        new Vector3D(Math.PI, Math.PI, Math.PI)
      )
      const bobbingAmount = debugUI.addInput(this, 'bobbingAmount' as any, {
        min: 0.0001,
        max: 0.01,
      })

      const bobbingRestitution = debugUI.addInput(this, 'bobbingRestitutionSpeed' as any, {
        min: 0.1,
        max: 100,
      })

      debugUI.viewmodelFolder.add(positionFolder)
      debugUI.viewmodelFolder.add(rotationFolder)
      debugUI.viewmodelFolder.add(bobbingAmount)
      debugUI.viewmodelFolder.add(bobbingRestitution)
    }
  }

  /** Get or create a fully-inited viewmodel for a weapon key */
  private getOrCreateWeaponMesh(key: string): FPSMesh | null {
    const cached = this.weaponCache.get(key)
    if (cached) {
      if (key === 'AWP') {
        const root = cached.mesh as unknown as THREE.Object3D
        if (!root.getObjectByName('AwpViewProp')) this.attachAwpProp(cached)
      }
      return cached
    }
    const source = Game.getInstance().globalLoadingManager.loadableMeshs.get(key)
    if (!source) return null
    const mesh = source.clone() as FPSMesh
    mesh.init()
    if (key === 'AWP') this.attachAwpProp(mesh)
    for (const animName of ['Shoot', 'Reload', 'Switch']) {
      if (mesh.animations.has(animName)) {
        mesh.playAnimation(animName)
      }
    }
    mesh.mixer?.stopAllAction()
    mesh.mixer?.setTime(0)
    this.weaponCache.set(key, mesh)
    return mesh
  }

  /**
   * Seat the baked CS2 AWP once: pose is tuned in viewmodel-root space, then
   * Object3D.attach() reparents onto Armature/Root while keeping that world pose.
   * Never re-seat later — live bone matrices would bake a wrong orientation.
   */
  private attachAwpProp(fps: FPSMesh): void {
    const root = fps.mesh as unknown as THREE.Object3D
    if (root.getObjectByName('AwpViewProp')) return

    const prop = Game.getInstance().globalLoadingManager.createAwpViewProp()
    if (!prop) {
      console.warn('[AWP] createAwpViewProp failed — is models/awp.glb loaded?')
      return
    }
    prop.name = 'AwpViewProp'
    prop.frustumCulled = false
    prop.visible = true
    prop.traverse((c) => {
      c.frustumCulled = false
      c.visible = true
    })

    prop.position.set(0.39, -0.25, -1.62)
    prop.rotation.set(0, Math.PI, 0)
    prop.scale.setScalar(3.7 / 1.36)
    root.add(prop)
    root.updateMatrixWorld(true)

    let seat: THREE.Object3D | undefined
    root.traverse((c) => {
      if (seat) return
      if (c.name === 'Root' && c.parent?.name === 'Armature') seat = c
    })
    if (!seat) {
      root.traverse((c) => {
        if (!seat && c.name === 'Armature') seat = c
      })
    }
    if (seat) seat.attach(prop)
  }

  /**
   * Swap to a cached weapon mesh (no mid-match SkeletonUtils.clone).
   * @param playSwitchAnim false when warming / initial equip
   */
  public equipWeaponMesh(key: string, playSwitchAnim = true): boolean {
    const mesh = this.getOrCreateWeaponMesh(key)
    if (!mesh) return false
    if (this.fpsMesh === mesh) {
      if (playSwitchAnim) this.handleWeaponSwitch()
      return true
    }
    this.setMesh(mesh, playSwitchAnim)
    return true
  }

  /** Pre-init AK / USP / Knife + compile viewmodel shaders before combat */
  public warmWeapons(renderer: THREE.WebGLRenderer): void {
    const keys = ['AK47', 'Usp', 'Knife', 'AWP']
    const meshes: THREE.Object3D[] = []
    for (const key of keys) {
      const mesh = this.getOrCreateWeaponMesh(key)
      if (mesh?.mesh) meshes.push(mesh.mesh)
    }
    this.game.renderer.viewmodelRenderer.warm(renderer, meshes)
    // Restore currently equipped gun under the camera
    if (this.fpsMesh?.mesh) {
      this.viewmodelCamera.add(this.fpsMesh.mesh)
      this.fpsMesh.addLights(this.viewmodelLights)
      this.show()
    }
  }

  public async warmShellParticles(): Promise<void> {
    if (this.shellTextureReady) await this.shellTextureReady
    if (!this.fpsMesh?.mesh || !this.tempEmitter) return

    const mesh = this.fpsMesh.mesh
    const prevVisible = mesh.visible
    mesh.visible = false
    try {
      this.tempEmitter.setRate(new Rate(1, 0.05))
      this.tempEmitter.emit()
      await new Promise<void>((r) => setTimeout(r, 80))
      this.tempEmitter.setRate(new Rate(0, 0))
    } catch {
      /* ignore */
    } finally {
      mesh.visible = prevVisible
    }
  }

  /** Dedicated lights so hands/guns aren't crushed by world shadows */
  private createViewmodelLights(): void {
    const key = new THREE.PointLight(0xfff2e6, 3.2, 3.5, 1.6)
    key.position.set(0.12, 0.18, 0.32)
    key.castShadow = false

    const fill = new THREE.PointLight(0xc8dcff, 1.6, 3, 1.7)
    fill.position.set(-0.22, 0.06, 0.18)
    fill.castShadow = false

    const ambient = new THREE.AmbientLight(0xffffff, 0.55)

    this.viewmodelLights = [key, fill, ambient]
  }

  public setMesh(mesh: LoadableMesh, playSwitchAnim = true): void {
    this.clearScope(false)
    this.removeMesh()
    this.fpsMesh = mesh as FPSMesh
    // Cached / already-inited weapons skip the expensive material bleach pass
    if (!this.fpsMesh.mixer) {
      this.fpsMesh.init()
    }
    this.weaponCache.set(this.fpsMesh.key, this.fpsMesh)
    // Remember post-init scale so hand flip never destroys model size
    this.baseViewScale.copy(this.fpsMesh.mesh.scale)
    // Re-parent lights onto the new viewmodel each switch
    this.fpsMesh.addLights(this.viewmodelLights)
    this.addToRenderer()
    this.initViewmodelPosition()
    this.applyHandSide()
    this.show()
    if (playSwitchAnim) this.handleWeaponSwitch()
  }

  /** Flip viewmodel between right / left hand */
  public toggleHands(): void {
    this.handSide = this.handSide === 1 ? -1 : 1
    this.applyHandSide()
  }

  private applyHandSide(): void {
    if (!this.fpsMesh?.mesh) return
    // Right = base scale from init; left = invert X only
    const bx = this.baseViewScale.x
    const by = this.baseViewScale.y
    const bz = this.baseViewScale.z
    this.fpsMesh.mesh.scale.set(this.handSide === 1 ? bx : -bx, by, bz)
    this.fpsMesh.mesh.visible = true
  }

  private initViewmodelPosition(): void {
    this.fpsMesh.mesh.position.copy(this.weaponOffset)
  }
  update(dt: number): void {
    super.update(dt)
    this.updateFovTransition(dt)

    this.viewmodelCamera.quaternion.copy(this.camera.quaternion)
    this.viewmodelCamera.fov =
      this.scopeLevel > 0 ? this.baseFov : (this.camera as THREE.PerspectiveCamera).fov
    this.viewmodelCamera.updateProjectionMatrix()

    if (this.player.isDead) {
      this.clearScope(false)
      this.hide()
      return
    }
    if (this.scopeLevel === 0) this.show()
    else this.hide()

    if (!this.game.renderer.renderingConfig.updateViewmodel) return
    if (this.scopeLevel > 0) return

    this.fpsMesh.update(dt)
    this.updateLocomotionAnim()
    this.idleSwayTime += dt

    const fpsCameraManager = this.playerCameraManager as FPSCameraManager

    if (fpsCameraManager.isRotating) {
      const rotationBobbing = new Vector2D(
        fpsCameraManager.rotationDelta.x,
        fpsCameraManager.rotationDelta.y
      ).multiplyScalar(this.bobbingAmount)

      this.weaponBobbingAcc.add(new Vector3D(rotationBobbing.y, rotationBobbing.x, 0))
    }

    const bobbingLerpAmount = Math.min(1, this.bobbingRestitutionSpeed * dt)

    this.weaponBobbingAcc.x = lerp(this.weaponBobbingAcc.x, 0, bobbingLerpAmount)
    this.weaponBobbingAcc.y = lerp(this.weaponBobbingAcc.y, 0, bobbingLerpAmount)
    this.weaponBobbingAcc.z = lerp(this.weaponBobbingAcc.z, 0, bobbingLerpAmount)

    this.fpsMesh.mesh.rotation.x = -this.weaponBobbingAcc.x + this.weaponRotation.x
    this.fpsMesh.mesh.rotation.y = -this.weaponBobbingAcc.y + this.weaponRotation.y
    this.fpsMesh.mesh.rotation.z = -this.weaponBobbingAcc.z + this.weaponRotation.z

    let jumpBobbing = this.player.velocity.y / 2500
    jumpBobbing = Math.max(-Math.PI / 128, jumpBobbing)

    this.weaponBobbingAcc.x += jumpBobbing

    const spd = Math.hypot(this.player.velocity.x, this.player.velocity.z)
    const moveAmp = Math.min(1, spd / 8)
    const bobbingAmount = Math.sin(this.moveEffect.y) * this.bobbingAmount * (0.55 + moveAmp * 0.7)
    const idleSwayX =
      Math.sin(this.idleSwayTime * 1.15) * 0.0028 + Math.sin(this.idleSwayTime * 2.4) * 0.0009
    const idleSwayY =
      Math.cos(this.idleSwayTime * 0.85) * 0.0021 + Math.cos(this.idleSwayTime * 1.9) * 0.0007
    this.fpsMesh.mesh.position.x =
      (this.weaponOffset.x + this.fpsMesh.viewmodelOffset.x + idleSwayX) * this.handSide
    this.fpsMesh.mesh.position.y =
      this.weaponOffset.y +
      this.fpsMesh.viewmodelOffset.y +
      bobbingAmount +
      Math.sin(this.moveEffect.y) / 50 +
      idleSwayY
    this.fpsMesh.mesh.position.z =
      this.weaponOffset.z + this.fpsMesh.viewmodelOffset.z + this.recoilEffect

    if (this.recoilEffect > 0) {
      this.recoilEffect = Math.max(0, this.recoilEffect - dt * this.recoilRecover)
    }
    this.switchVelocity += dt * 4

    if (this.switchVelocity >= -this.weaponOffset.y / 2) {
      this.switchVelocity -= dt * 4
      this.switchVelocity = Math.max(0, this.switchVelocity)
    }
  }

  public handleMove(moveVector: Vector3D, dt: number): void {
    this.moveEffect = new Vector3D(moveVector.x, this.moveEffect.y + 16 * dt, moveVector.z)
  }
  private initParticleEmitter() {
    this.shellTextureReady = new Promise((resolve) => {
      const map = new THREE.TextureLoader().load(
        'dot.png',
        () => resolve(),
        undefined,
        () => resolve()
      )
      const material = new THREE.SpriteMaterial({
        map,
        color: 0xff0000,
        blending: THREE.AdditiveBlending,
        fog: true,
      })
      // Touch sprite construction once
      void new THREE.Sprite(material)
    })
    this.tempEmitter = new Emitter()

    this.tempEmitter
      .addInitializers([
        new Mass(1),
        new Radius(80),
        new Life(2),
        new RadialVelocity(1, new NebulaVector3D(4, 1, 0), 0),
      ])
      .addBehaviours([
        new RandomDrift(1, 0, 1, 0.05),
        new Alpha(0.1, 0),
        new Rotate('random', 'random'),
        new Gravity(0.1),
        new Color(0xffffff, 'random', Infinity, ease.easeOutQuart),
      ])

    this.game.renderer.particleManager.addParticleEmitter(this.tempEmitter)
  }

  /** AWP scope cycle: hip → zoom1 → zoom2 → hip */
  public handleZoom(): void {
    if (this.player.currentWeapon.key !== 'AWP' || this.player.isDead) return
    if (this.pendingRezoomLevel > 0) this.cancelScopedBoltCycle()
    this.scopeLevel = (this.scopeLevel + 1) % 3
    this.applyScope(false)
    void this.game.audioManager.playZoom()
  }

  public clearScope(playSound = false): void {
    this.cancelScopedBoltCycle()
    const wasOn = this.scopeLevel > 0 || !!this.scopeOverlay?.classList.contains('is-on')
    this.scopeLevel = 0
    this.applyScope(true)
    if (playSound && wasOn) void this.game.audioManager.playZoom()
  }

  private beginScopedBoltCycle(fromLevel: 1 | 2): void {
    this.pendingRezoomLevel = fromLevel
    this.boltCycleToken++
    const token = this.boltCycleToken
    this.scopeLevel = 0
    this.applyScope(false)
    this.game.audioManager.playAwpBoltCycle(() => {
      if (token !== this.boltCycleToken) return
      if (this.player.isDead || this.player.currentWeapon.key !== 'AWP') {
        this.pendingRezoomLevel = 0
        return
      }
      this.completeScopedBoltCycle()
    })
  }

  private completeScopedBoltCycle(): void {
    const level = this.pendingRezoomLevel
    this.pendingRezoomLevel = 0
    if (level <= 0 || this.player.isDead || this.player.currentWeapon.key !== 'AWP') return
    this.scopeLevel = level
    this.applyScope(false)
    void this.game.audioManager.playZoom(0.72)
  }

  private cancelScopedBoltCycle(): void {
    if (this.pendingRezoomLevel === 0) {
      this.game.audioManager.clearAwpBoltTimers()
      return
    }
    this.pendingRezoomLevel = 0
    this.boltCycleToken++
    this.game.audioManager.clearAwpBoltTimers()
  }

  private updateFovTransition(dt: number): void {
    const cam = this.camera as THREE.PerspectiveCamera
    const diff = this.targetFov - cam.fov
    if (Math.abs(diff) < 0.04) {
      if (cam.fov !== this.targetFov) this.setFov(this.targetFov)
      return
    }
    const zoomingIn = this.targetFov < cam.fov
    const rate = zoomingIn ? FPSRenderer.FOV_LERP_IN : FPSRenderer.FOV_LERP_OUT
    this.setFov(lerp(cam.fov, this.targetFov, Math.min(1, dt * rate)))
  }

  private applyScope(snap: boolean): void {
    this.targetFov =
      this.scopeLevel === 0
        ? this.baseFov
        : FPSRenderer.SCOPE_FOVS[this.scopeLevel - 1] ?? this.baseFov
    if (snap) this.setFov(this.targetFov)
    this.viewmodelCamera.fov = this.baseFov
    this.viewmodelCamera.updateProjectionMatrix()

    const overlay = this.ensureScopeOverlay()
    overlay.classList.remove('is-level-1', 'is-level-2')
    if (this.scopeLevel > 0) {
      this.hide()
      overlay.classList.add('is-on', `is-level-${this.scopeLevel}`)
    } else {
      overlay.classList.remove('is-on')
      if (this.fpsMesh?.mesh) this.fpsMesh.mesh.visible = true
    }
  }

  private ensureScopeOverlay(): HTMLElement {
    if (this.scopeOverlay) return this.scopeOverlay
    let el = document.getElementById('awp-scope')
    if (!el) {
      el = document.createElement('div')
      el.id = 'awp-scope'
      document.body.appendChild(el)
    }
    el.innerHTML = `
      <div class="awp-scope-lens">
        <div class="awp-scope-glass"></div>
        <div class="awp-scope-reticle">
          <span class="awp-scope-arm awp-scope-arm-t"></span>
          <span class="awp-scope-arm awp-scope-arm-b"></span>
          <span class="awp-scope-arm awp-scope-arm-l"></span>
          <span class="awp-scope-arm awp-scope-arm-r"></span>
          <span class="awp-scope-tick awp-scope-tick-t"></span>
          <span class="awp-scope-tick awp-scope-tick-b"></span>
          <span class="awp-scope-tick awp-scope-tick-l"></span>
          <span class="awp-scope-tick awp-scope-tick-r"></span>
          <span class="awp-scope-dot"></span>
        </div>
        <div class="awp-scope-ring"></div>
      </div>
    `
    let style = document.getElementById('awp-scope-styles') as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = 'awp-scope-styles'
      document.head.appendChild(style)
    }
    style.textContent = `
      #awp-scope {
        position: fixed; inset: 0; z-index: 10001; pointer-events: none;
        opacity: 0; visibility: hidden;
        transition: opacity 0.1s ease-out, visibility 0.1s;
      }
      #awp-scope.is-on { opacity: 1; visibility: visible; }
      .awp-scope-lens {
        position: absolute; left: 50%; top: 50%;
        width: min(96vmin, 980px); height: min(96vmin, 980px);
        transform: translate(-50%, -50%);
        border-radius: 50%;
        box-shadow: 0 0 0 9999px #000;
        overflow: hidden;
      }
      .awp-scope-glass {
        position: absolute; inset: 0; border-radius: 50%;
        background:
          radial-gradient(circle at 38% 32%, rgba(255,255,255,0.07), transparent 42%),
          radial-gradient(circle at center, transparent 48%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.88) 100%);
      }
      .awp-scope-ring {
        position: absolute; inset: 1.2%;
        border-radius: 50%;
        border: 2px solid rgba(0,0,0,0.55);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        pointer-events: none;
      }
      .awp-scope-reticle {
        position: absolute; inset: 0;
      }
      .awp-scope-arm {
        position: absolute;
        background: #0a0a0a;
        box-shadow: 0 0 0 0.5px rgba(255,255,255,0.18);
      }
      .awp-scope-arm-t, .awp-scope-arm-b {
        left: 50%; width: 1.5px; margin-left: -0.75px;
      }
      .awp-scope-arm-l, .awp-scope-arm-r {
        top: 50%; height: 1.5px; margin-top: -0.75px;
      }
      .awp-scope-arm-t { top: 7%; height: calc(50% - 14px); }
      .awp-scope-arm-b { bottom: 7%; height: calc(50% - 14px); }
      .awp-scope-arm-l { left: 7%; width: calc(50% - 14px); }
      .awp-scope-arm-r { right: 7%; width: calc(50% - 14px); }
      .awp-scope-tick {
        position: absolute;
        background: #0a0a0a;
        box-shadow: 0 0 0 0.5px rgba(255,255,255,0.14);
      }
      .awp-scope-tick-t, .awp-scope-tick-b {
        left: 50%; width: 11px; height: 1.5px; margin-left: -5.5px;
      }
      .awp-scope-tick-l, .awp-scope-tick-r {
        top: 50%; width: 1.5px; height: 11px; margin-top: -5.5px;
      }
      .awp-scope-tick-t { top: calc(50% - 42px); }
      .awp-scope-tick-b { top: calc(50% + 40px); }
      .awp-scope-tick-l { left: calc(50% - 42px); }
      .awp-scope-tick-r { left: calc(50% + 40px); }
      .awp-scope-dot {
        position: absolute; left: 50%; top: 50%;
        width: 2px; height: 2px; margin: -1px 0 0 -1px;
        border-radius: 50%; background: #050505;
        box-shadow: 0 0 0 0.5px rgba(255,255,255,0.2);
      }
      #awp-scope.is-level-2 .awp-scope-arm-t { height: calc(50% - 11px); }
      #awp-scope.is-level-2 .awp-scope-arm-b { height: calc(50% - 11px); }
      #awp-scope.is-level-2 .awp-scope-arm-l { width: calc(50% - 11px); }
      #awp-scope.is-level-2 .awp-scope-arm-r { width: calc(50% - 11px); }
      #awp-scope.is-level-2 .awp-scope-tick-t { top: calc(50% - 52px); }
      #awp-scope.is-level-2 .awp-scope-tick-b { top: calc(50% + 50px); }
      #awp-scope.is-level-2 .awp-scope-tick-l { left: calc(50% - 52px); }
      #awp-scope.is-level-2 .awp-scope-tick-r { left: calc(50% + 50px); }
      #awp-scope.is-level-2 .awp-scope-lens {
        width: min(98vmin, 1040px); height: min(98vmin, 1040px);
      }
    `
    this.scopeOverlay = el
    return el
  }

  addToRenderer(): void {
    this.viewmodelCamera.add(this.fpsMesh.mesh)
  }
}
