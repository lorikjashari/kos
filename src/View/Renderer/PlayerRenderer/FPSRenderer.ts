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
    super.handleShoot(hitscanResult)
    this.fpsMesh.playAnimation('Shoot')
    const isMelee = this.player.currentWeapon.fireMode === 'melee'
    this.recoilEffect = isMelee ? 0.06 : 0.12
    // Recoil after the shot so this bullet matches the crosshair (KoS)
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
  }

  public handleReload(): void {
    this.fpsMesh.playAnimation('Reload')
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.resetRecoil()
    }
    const rel = this.fpsMesh.animations.get('Reload')
    if (rel?.Start && rel?.End && this.fpsMesh.animations.has('Idle')) {
      const durSec = Math.max(0.2, (rel.End.time - Math.abs(rel.Start.time)) / 1.5)
      window.setTimeout(() => {
        if (this.fpsMesh?.animations.has('Idle')) {
          this.fpsMesh.playAnimation('Idle', true, true)
        }
      }, durSec * 1000 + 40)
    }
  }

  public handleWeaponSwitch(): void {
    this.clearScope(false)
    this.switchVelocity = 0.05
    this.fpsMesh.playAnimation('Switch')
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.resetRecoil()
    }
    // After the draw clip, settle into looping Idle (hands + AWP bone seat)
    const sw = this.fpsMesh.animations.get('Switch')
    if (sw?.Start && sw?.End && this.fpsMesh.animations.has('Idle')) {
      const durSec = Math.max(0.2, (sw.End.time - Math.abs(sw.Start.time)) / 1.5)
      window.setTimeout(() => {
        if (this.fpsMesh?.animations.has('Idle')) {
          this.fpsMesh.playAnimation('Idle', true, true)
        }
      }, durSec * 1000 + 40)
    }
  }
  private switchVelocity = 0
  private viewmodelCamera: THREE.PerspectiveCamera
  public fpsMesh!: FPSMesh
  private recoilEffect = 0
  private idleSwayTime = 0
  /** 0 hipfire, 1 first zoom, 2 second zoom — AWP only */
  private scopeLevel = 0
  private scopeOverlay: HTMLElement | null = null
  private static readonly SCOPE_FOVS = [40, 15] as const

  public isScoped(): boolean {
    return this.scopeLevel > 0
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
      // Hot reload / older cache may be missing the AWP prop — ensure it's seated
      if (key === 'AWP') this.attachAwpProp(cached)
      return cached
    }
    const source = Game.getInstance().globalLoadingManager.loadableMeshs.get(key)
    if (!source) return null
    const mesh = source.clone() as FPSMesh
    mesh.init()
    if (key === 'AWP') this.attachAwpProp(mesh)
    // Touch every clipAction once so first Shoot/Reload/Switch never allocates
    for (const animName of ['Shoot', 'Reload', 'Switch']) {
      if (mesh.animations.has(animName)) {
        mesh.playAnimation(animName)
      }
    }
    mesh.mixer?.stopAllAction()
    this.weaponCache.set(key, mesh)
    return mesh
  }

  /**
   * Seat the baked CS2 AWP using the tuned idle pose, then reparent onto the
   * Galil Armature Root bone so Switch / Shoot / Reload animations carry it.
   * Object3D.attach() keeps the world pose while parenting.
   */
  private attachAwpProp(fps: FPSMesh): void {
    const root = fps.mesh as unknown as THREE.Object3D

    // Drop any previous seat so tweaks always apply (cache-safe)
    const stale: THREE.Object3D[] = []
    root.traverse((c) => {
      if (c.name === 'AwpViewProp') stale.push(c)
    })
    for (const c of stale) c.parent?.remove(c)

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

    // Tuned idle seat (root-local, under scale -1,-1,-1)
    prop.position.set(0.39, -0.25, -1.62)
    prop.rotation.set(0, Math.PI, 0)
    prop.scale.setScalar(3.7 / 1.36)
    root.add(prop)
    root.updateMatrixWorld(true)

    // Prefer Armature/Root so draw / fire / reload clips move the rifle with the hands
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
    if (seat) {
      seat.attach(prop)
    }
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
    this.fpsMesh.mesh.position.add(this.weaponOffset)
  }
  update(dt: number): void {
    super.update(dt)

    // Keep overlay camera matched to player look; keep hip FOV while scoped (gun hidden)
    this.viewmodelCamera.quaternion.copy(this.camera.quaternion)
    this.viewmodelCamera.fov =
      this.scopeLevel > 0 ? this.baseFov : (this.camera as THREE.PerspectiveCamera).fov
    this.viewmodelCamera.updateProjectionMatrix()

    // Drop the gun out of view while dead (POV is on the ground)
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
    this.idleSwayTime += dt

    const fpsCameraManager = this.playerCameraManager as FPSCameraManager

    // Apply rotation bobbing if the camera is rotating
    if (fpsCameraManager.isRotating) {
      const rotationBobbing = new Vector2D(
        fpsCameraManager.rotationDelta.x,
        fpsCameraManager.rotationDelta.y
      ).multiplyScalar(this.bobbingAmount)

      this.weaponBobbingAcc.add(new Vector3D(rotationBobbing.y, rotationBobbing.x, 0))
    }

    // Calculate bobbing restitution speed and amount
    const bobbingLerpAmount = Math.min(1, this.bobbingRestitutionSpeed * dt)

    // Apply bobbing to each axis of the weapon's rotation
    this.weaponBobbingAcc.x = lerp(this.weaponBobbingAcc.x, 0, bobbingLerpAmount)
    this.weaponBobbingAcc.y = lerp(this.weaponBobbingAcc.y, 0, bobbingLerpAmount)
    this.weaponBobbingAcc.z = lerp(this.weaponBobbingAcc.z, 0, bobbingLerpAmount)

    // Update the weapon's rotation with bobbing effect
    this.fpsMesh.mesh.rotation.x = -this.weaponBobbingAcc.x + this.weaponRotation.x
    this.fpsMesh.mesh.rotation.y = -this.weaponBobbingAcc.y + this.weaponRotation.y
    this.fpsMesh.mesh.rotation.z = -this.weaponBobbingAcc.z + this.weaponRotation.z

    // Apply jump bobbing
    let jumpBobbing = this.player.velocity.y / 2500
    jumpBobbing = Math.max(-Math.PI / 128, jumpBobbing)

    this.weaponBobbingAcc.x += jumpBobbing

    // Apply bobbing to the weapon's position
    const bobbingAmount = Math.sin(this.moveEffect.y) * this.bobbingAmount
    const idleSwayX = Math.sin(this.idleSwayTime * 1.3) * 0.003
    const idleSwayY = Math.cos(this.idleSwayTime * 0.9) * 0.002
    this.fpsMesh.mesh.position.x =
      (this.weaponOffset.x + this.fpsMesh.viewmodelOffset.x + idleSwayX) * this.handSide
    this.fpsMesh.mesh.position.y =
      this.weaponOffset.y + this.fpsMesh.viewmodelOffset.y + bobbingAmount + Math.sin(this.moveEffect.y) / 50 + idleSwayY
    this.fpsMesh.mesh.position.z = this.weaponOffset.z + this.fpsMesh.viewmodelOffset.z + this.recoilEffect

    // Apply recoil effect
    if (this.recoilEffect > 0) this.recoilEffect -= dt / 2
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
    this.scopeLevel = (this.scopeLevel + 1) % 3
    this.applyScope()
    void this.game.audioManager.playZoom()
  }

  public clearScope(playSound = false): void {
    if (this.scopeLevel === 0 && !this.scopeOverlay?.classList.contains('is-on')) return
    this.scopeLevel = 0
    this.applyScope()
    if (playSound) void this.game.audioManager.playZoom()
  }

  private applyScope(): void {
    const fov =
      this.scopeLevel === 0
        ? this.baseFov
        : FPSRenderer.SCOPE_FOVS[this.scopeLevel - 1] ?? this.baseFov
    this.setFov(fov)
    this.viewmodelCamera.fov = this.baseFov
    this.viewmodelCamera.updateProjectionMatrix()

    const overlay = this.ensureScopeOverlay()
    if (this.scopeLevel > 0) {
      this.hide()
      overlay.classList.add('is-on')
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
      el.innerHTML = `
        <div class="awp-scope-vignette"></div>
        <div class="awp-scope-lens">
          <div class="awp-scope-cross-h"></div>
          <div class="awp-scope-cross-v"></div>
          <div class="awp-scope-dot"></div>
        </div>
      `
      document.body.appendChild(el)
      if (!document.getElementById('awp-scope-styles')) {
        const style = document.createElement('style')
        style.id = 'awp-scope-styles'
        style.textContent = `
          #awp-scope {
            position: fixed; inset: 0; z-index: 7; pointer-events: none;
            opacity: 0; visibility: hidden; transition: opacity 0.08s linear;
          }
          #awp-scope.is-on { opacity: 1; visibility: visible; }
          .awp-scope-vignette {
            position: absolute; inset: 0;
            background: radial-gradient(circle at center,
              transparent 0%, transparent 22%,
              rgba(0,0,0,0.55) 38%, #000 52%);
          }
          .awp-scope-lens {
            position: absolute; left: 50%; top: 50%;
            width: min(92vmin, 920px); height: min(92vmin, 920px);
            transform: translate(-50%, -50%);
            border-radius: 50%;
            box-shadow: 0 0 0 9999px #000;
            background: radial-gradient(circle at 42% 38%,
              rgba(255,255,255,0.04), transparent 55%);
          }
          .awp-scope-cross-h, .awp-scope-cross-v {
            position: absolute; background: rgba(0,0,0,0.85);
          }
          .awp-scope-cross-h {
            left: 8%; right: 8%; top: 50%; height: 1px;
            transform: translateY(-50%);
          }
          .awp-scope-cross-v {
            top: 8%; bottom: 8%; left: 50%; width: 1px;
            transform: translateX(-50%);
          }
          .awp-scope-dot {
            position: absolute; left: 50%; top: 50%;
            width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px;
            border-radius: 50%; background: #111;
          }
        `
        document.head.appendChild(style)
      }
    }
    this.scopeOverlay = el
    return el
  }

  addToRenderer(): void {
    this.viewmodelCamera.add(this.fpsMesh.mesh)
  }
}
