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
import {
  BUTTERFLY_KNIFE_PROP,
  BUTTERFLY_KNIFE_SEAT,
  getKnifeClipDuration,
  getKnifePlayProgress,
  getKnifeProp,
  getKnifePropTune,
  holdKnifeClipEnd,
  holdKnifeDrawStart,
  holdKnifeRest,
  nudgeKnifePropPosition,
  nudgeKnifePropScale,
  playKnifeClip,
  resetKnifePropSeat,
  seatKnifePropOnHands,
  setKnifePropVisible,
  updateKnifeProp,
} from '../../Mesh/GoldSrc/MDLKnifeProp'
import { Player } from '../../../Core/Player'
import { HitscanResult } from '../../../Interface/utils'
import { PlayerRenderer } from './PlayerRenderer'
import { Vector2D, Vector3D } from '../../../Core/Vector'
import { Game } from '../../../Game'
import { mapHasButterflyKnife } from '../../../Core/MapCatalog'
import { FPSCameraManager } from '../../CameraManager/FPSCameraManager'
import { CameraManager } from '../../CameraManager/CameraManager'
import { lerp } from '../../../Core/MathUtils'
import { isTouchDevice } from '../../../UI/MobileDevice'
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
    if (this.scopeLevel > 0 || !this.fpsMesh?.mesh) return
    this.fpsMesh.mesh.visible = true
  }
  hide(): void {
    if (!this.fpsMesh?.mesh) return
    this.fpsMesh.mesh.visible = false
  }
  // Left click given by InputManager
  public handleShoot(hitscanResult: HitscanResult): void {
    const fps = this.fpsMesh
    if (!fps) return
    const scopedAwp = this.player.currentWeapon.key === 'AWP' && this.scopeLevel > 0
    const rezoomLevel = this.scopeLevel
    super.handleShoot(hitscanResult)
    const key = this.player.currentWeapon.key
    const isMelee = this.player.currentWeapon.fireMode === 'melee'
    const akm = this.isAkmFps()
    if (key === 'AWP') {
      fps.playAnimation('Shoot', false, true, 1.05)
      this.recoilEffect = 0.24
      this.recoilRecover = 1.35
      this.weaponBobbingAcc.x += 0.042
      this.weaponBobbingAcc.y += (Math.random() - 0.5) * 0.028
      this.weaponBobbingAcc.z += 0.012
    } else if (key === 'AK47') {
      if (!akm) fps.playAnimation('Shoot', false, true, 1.85)
      if (akm) {
        // Soft punch that eases back — no pose snap
        this.akShootKick = 1
        this.recoilEffect = Math.min(0.11, this.recoilEffect + 0.05)
        this.recoilRecover = 1.85
        this.weaponBobbingAcc.x += 0.022
        this.weaponBobbingAcc.y += (Math.random() - 0.5) * 0.01
        this.weaponBobbingAcc.z += 0.004
      } else {
        this.recoilEffect = 0.13
        this.recoilRecover = 3.4
        this.weaponBobbingAcc.x += 0.016
        this.weaponBobbingAcc.y += (Math.random() - 0.5) * 0.012
        this.weaponBobbingAcc.z += 0.008
      }
    } else if (key === 'Butterfly' || fps.key === 'Butterfly') {
      if (this.bfDrawing || performance.now() < this.butterflyDeployUntil) return
      this.cancelButterflyAnims()
      this.ensureButterflyKnifeProp(fps)
      const root = fps.mesh as unknown as THREE.Object3D
      const knifeClip = this.resolveButterflySlashClip(root)
      // CS 1.6: hands stay at draw-ready; MDL knife carries midslash motion.
      fps.holdPoseAt(this.butterflyReadyPoseTime())
      const knifeDur = this.playButterflyClip(knifeClip, 1)
      this.recoilEffect = 0.05
      this.recoilRecover = 3.2
      this.weaponBobbingAcc.x += 0.024
      this.weaponBobbingAcc.y += (Math.random() - 0.5) * 0.014
      setKnifePropVisible(root, true)
      this.scheduleButterflyReadyReturn(knifeDur, true, knifeClip)
    } else {
      fps.playAnimation('Shoot', false, true, 1.55)
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
    if (akm || key === 'Butterfly' || fps.key === 'Butterfly') return
    const shootScale = key === 'AWP' ? 1.05 : key === 'AK47' ? 1.85 : 1.55
    this.scheduleIdleReturn('Shoot', shootScale)
  }


  public handleReload(): void {
    const fps = this.fpsMesh
    if (!fps) return
    this.clearScope(false)
    const meshKey = fps.key
    const akm = this.isAkmFps()
    const reloadTime = Math.max(0.4, this.player.currentWeapon.reloadTime || 2.4)
    const rel = fps.animations.get('Reload')
    let scale = this.player.currentWeapon.key === 'AWP' ? 1.35 : 1.55
    let durSec = 0.2
    if (akm && rel?.Start && rel?.End) {
      // Play full mag clip (~bit faster than realtime) — don't cut early
      const clipLen = Math.max(0.2, rel.End.time - Math.abs(rel.Start.time))
      scale = 1.2
      durSec = clipLen / scale
    } else if (rel?.Start && rel?.End) {
      durSec = Math.max(0.2, (rel.End.time - Math.abs(rel.Start.time)) / scale)
    }
    fps.playAnimation('Reload', false, true, scale)
    this.locomotionBusyUntil = performance.now() + Math.max(reloadTime, durSec) * 1000 + 80
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.resetRecoil()
    }
    if (rel?.Start && rel?.End) {
      window.setTimeout(() => {
        if (this.fpsMesh?.key !== meshKey) return
        if (akm) {
          // Back to ready hold after full clip (don't freeze on reload end frame)
          this.fpsMesh.holdPoseAt(0)
          return
        }
        if (this.fpsMesh.animations.has('Idle')) {
          this.fpsMesh.playAnimation('Idle', true, true, 1.0)
        }
      }, durSec * 1000 + 60)
    }
  }

  public handleWeaponSwitch(): void {
    const fps = this.fpsMesh
    if (!fps) return
    this.clearScope(false)
    this.switchVelocity = 0.05
    const meshKey = fps.key
    const key = fps.key
    if (this.isAkmFps()) {
      fps.holdPoseAt(0)
      this.startAkDrawUp()
      return
    }
    if (key === 'Butterfly') {
      this.cancelButterflyAnims()
      this.ensureButterflyKnifeProp(fps)
      const root = fps.mesh as unknown as THREE.Object3D
      setKnifePropVisible(root, false)
      holdKnifeDrawStart(root)
      this.bfDrawing = true
      const knifeDur = this.playButterflyClip('draw', 1)
      const handScale = this.butterflyDrawHandScale(knifeDur)
      fps.playAnimation('Switch', false, true, handScale)
      this.butterflyDeployUntil = performance.now() + Math.max(750, knifeDur * 1000)
      this.weaponBobbingAcc.x += 0.015
      if (this.playerCameraManager instanceof FPSCameraManager) {
        this.playerCameraManager.resetRecoil()
      }
      this.scheduleButterflyReadyReturn(knifeDur)
      return
    }
    const scale = key === 'AWP' ? 1.25 : key === 'AK47' ? 1.45 : 1.5
    fps.playAnimation('Switch', false, true, scale)
    this.weaponBobbingAcc.x += 0.02
    this.weaponBobbingAcc.y -= 0.03
    if (this.playerCameraManager instanceof FPSCameraManager) {
      this.playerCameraManager.resetRecoil()
    }
    const sw = fps.animations.get('Switch')
    if (sw?.Start && sw?.End && fps.animations.has('Idle')) {
      const durSec = Math.max(0.2, (sw.End.time - Math.abs(sw.Start.time)) / scale)
      this.locomotionBusyUntil = performance.now() + durSec * 1000 + 80
      window.setTimeout(() => {
        if (this.fpsMesh?.key === meshKey && this.fpsMesh.animations.has('Idle')) {
          this.fpsMesh.playAnimation('Idle', true, true, 1.0)
        }
      }, durSec * 1000 + 40)
    }
  }

  /** Raise editor AK from below into the ready hold. */
  private startAkDrawUp(): void {
    this.akDrawT = FPSRenderer.AK_DRAW_DUR
  }

  private playButterflyClip(name: string, timeScale: number): number {
    const fps = this.fpsMesh
    if (!fps) return 0
    return playKnifeClip(fps.mesh as unknown as THREE.Object3D, name, false, timeScale)
  }

  /** CS 1.6 primary slash — alternates midslash1 / midslash2. */
  private resolveButterflySlashClip(root: THREE.Object3D): string {
    const preferred = this.butterflySlashAlt ? 'midslash2' : 'midslash1'
    this.butterflySlashAlt = !this.butterflySlashAlt
    for (const name of [preferred, 'midslash1', 'midslash2', 'slash1', 'slash2']) {
      if (getKnifeClipDuration(root, name, 1) > 0) return name
    }
    return 'draw'
  }

  /** Sync M9 Switch length to MDL draw (~0.73s in CS knife). */
  private butterflyDrawHandScale(knifeDrawSec: number): number {
    const handSpan = this.butterflyHandClipSpan('Switch')
    if (handSpan <= 0 || knifeDrawSec <= 0) return 1.45
    return Math.min(FPSRenderer.BF_HAND_SWITCH_CAP, Math.max(1.15, handSpan / knifeDrawSec))
  }

  /** M9 Switch/Shoot wall-clock length at a given hand time scale. */
  private butterflyHandWallSec(clip: 'Switch' | 'Shoot', handTimeScale: number): number {
    const fps = this.fpsMesh
    if (!fps) return 0
    const m = fps.animations.get(clip)
    if (!m?.Start || !m?.End) return 0
    return Math.max(0.05, (m.End.time - Math.abs(m.Start.time)) / Math.max(0.05, handTimeScale))
  }

  /** Natural M9 Switch clip length (time scale 1). */
  private butterflyHandClipSpan(clip: 'Switch' | 'Shoot'): number {
    return this.butterflyHandWallSec(clip, 1)
  }

  /** End of M9 Switch clip — ready knife hold (M9 has no Idle marker). */
  private butterflyReadyPoseTime(): number {
    const sw = this.fpsMesh?.animations.get('Switch')
    return sw?.End?.time ?? 2.3
  }

  /** CS draw-ready: last frame of draw on knife, Switch end on hands. */
  private butterflyReadyHold(): void {
    const fps = this.fpsMesh
    if (!fps || fps.key !== 'Butterfly') return
    const root = fps.mesh as unknown as THREE.Object3D
    holdKnifeRest(root)
    fps.holdPoseAt(this.butterflyReadyPoseTime())
    this.bfDrawing = false
    setKnifePropVisible(root, true)
  }

  private butterflyReturnToReady(): void {
    this.butterflyReadyHold()
  }

  /** Hold slash end pose on knife; hands stay at draw-ready (CS m_flTimeWeaponIdle gate). */
  private butterflyHoldShootFollowThrough(knifeClip: string): void {
    const fps = this.fpsMesh
    if (!fps || fps.key !== 'Butterfly') return
    const root = fps.mesh as unknown as THREE.Object3D
    fps.holdPoseAt(this.butterflyReadyPoseTime())
    holdKnifeClipEnd(root, knifeClip)
    setKnifePropVisible(root, true)

    const meshKey = fps.key
    const token = this.butterflyAnimToken
    const holdMs = FPSRenderer.BF_SHOOT_FOLLOW_HOLD_SEC * 1000
    this.locomotionBusyUntil = Math.max(
      this.locomotionBusyUntil,
      performance.now() + holdMs
    )
    if (this.butterflyReadyTimeout !== null) {
      clearTimeout(this.butterflyReadyTimeout)
    }
    this.butterflyReadyTimeout = window.setTimeout(() => {
      this.butterflyReadyTimeout = null
      if (token !== this.butterflyAnimToken) return
      const live = this.fpsMesh
      if (!live || live.key !== meshKey) return
      if (this.scopeLevel > 0) return
      this.butterflyReturnToReady()
    }, holdMs + 30)
  }

  private scheduleButterflyReadyReturn(
    durSec: number,
    afterShoot = false,
    knifeClip = 'midslash1'
  ): void {
    const fps = this.fpsMesh
    if (!fps) return
    const meshKey = fps.key
    const token = this.butterflyAnimToken
    const tailSec = afterShoot ? FPSRenderer.BF_SHOOT_FOLLOW_HOLD_SEC : 0
    this.locomotionBusyUntil = Math.max(
      this.locomotionBusyUntil,
      performance.now() + (durSec + tailSec) * 1000
    )
    if (this.butterflyReadyTimeout !== null) {
      clearTimeout(this.butterflyReadyTimeout)
    }
    this.butterflyReadyTimeout = window.setTimeout(() => {
      this.butterflyReadyTimeout = null
      if (token !== this.butterflyAnimToken) return
      const live = this.fpsMesh
      if (!live || live.key !== meshKey) return
      if (this.scopeLevel > 0) return
      if (afterShoot) {
        this.butterflyHoldShootFollowThrough(knifeClip)
      } else {
        this.butterflyReturnToReady()
      }
    }, durSec * 1000 + 30)
  }

  /** Stop pending butterfly callbacks when swapping weapons quickly. */
  private cancelButterflyAnims(): void {
    if (this.fpsMesh?.key === 'Butterfly') {
      setKnifePropVisible(this.fpsMesh.mesh as unknown as THREE.Object3D, false)
    }
    this.butterflyAnimToken++
    if (this.butterflyReadyTimeout !== null) {
      clearTimeout(this.butterflyReadyTimeout)
      this.butterflyReadyTimeout = null
    }
    this.bfDrawing = false
    this.butterflyDeployUntil = 0
  }

  private ensureButterflyKnifeProp(fps: FPSMesh): void {
    const root = fps.mesh as unknown as THREE.Object3D
    if (!root.getObjectByName(BUTTERFLY_KNIFE_PROP)) {
      this.attachButterflyKnife(fps)
    }
  }

  /** Hide knife until MDL draw passes ~12% — CS deploy, no extra procedural rise. */
  private syncButterflyKnifeVisibility(): void {
    if (!this.fpsMesh || this.fpsMesh.key !== 'Butterfly') return
    const root = this.fpsMesh.mesh as unknown as THREE.Object3D
    if (!getKnifeProp(root)) return

    let drawProgress = 1
    if (this.bfDrawing) {
      const knifeProgress = getKnifePlayProgress(root)
      const handProgress = this.fpsMesh.getAnimWallProgress()
      drawProgress = Math.max(knifeProgress, handProgress)
      if (drawProgress >= 0.995) this.bfDrawing = false
    }

    const visible = !this.bfDrawing || drawProgress > 0.12
    setKnifePropVisible(root, visible)
  }

  private scheduleButterflyIdleReturn(durSec: number): void {
    this.scheduleButterflyReadyReturn(durSec)
  }

  private scheduleIdleReturn(fromAnim: string, timeScale: number): void {
    const fps = this.fpsMesh
    if (!fps) return
    const meshKey = fps.key
    const clip = fps.animations.get(fromAnim)
    if (!clip?.Start || !clip?.End) return
    const durSec = Math.max(0.12, (clip.End.time - Math.abs(clip.Start.time)) / timeScale)
    this.locomotionBusyUntil = Math.max(this.locomotionBusyUntil, performance.now() + durSec * 1000)
    window.setTimeout(() => {
      const live = this.fpsMesh
      if (!live || live.key !== meshKey) return
      if (this.scopeLevel > 0) return
      const cur = live.getCurrentAnimName()
      if (cur === 'Reload' || cur === 'Switch') return
      if (this.isAkmFps()) {
        live.holdPoseAt(0)
        return
      }
      if (!live.animations.has('Idle')) return
      live.playAnimation('Idle', true, true, 1.0)
    }, durSec * 1000 + 30)
  }

  private updateLocomotionAnim(): void {
    if (this.fpsMesh?.key === 'Butterfly') return
    if (this.isAkmFps()) return
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
  public fpsMesh: FPSMesh | null = null
  private recoilEffect = 0
  private recoilRecover = 2.5
  private idleSwayTime = 0
  private locomotionBusyUntil = 0
  /** AKM: seconds left on draw-up from below */
  private akDrawT = 0
  /** True while CS knife draw deploy is playing. */
  private bfDrawing = false
  /** CS DefaultDeploy — block slash during equip (~0.75s). */
  private butterflyDeployUntil = 0
  private butterflySlashAlt = false
  private butterflyAnimToken = 0
  private butterflyReadyTimeout: number | null = null
  private static readonly AK_DRAW_DUR = 0.42
  /** Cap hand speed on M9 Switch during draw sync. */
  private static readonly BF_HAND_SWITCH_CAP = 2.05
  /** CS m_flTimeWeaponIdle after primary slash. */
  private static readonly BF_SHOOT_FOLLOW_HOLD_SEC = 2.0
  /** AKM: 1→0 shoot kick envelope */
  private akShootKick = 0
  /** Sketchfab AKM viewmodel (main AK47 + editor alias). */
  private isAkmFps(): boolean {
    return this.fpsMesh?.key === 'AK47'
  }
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
  /**
   * Phones use a taller viewport and on-screen controls sit under the gun, so the
   * viewmodel is nudged toward the bottom-right corner. Applied outside the
   * hand-side flip so it is always screen-right / screen-down.
   */
  private readonly platformViewOffsetX = isTouchDevice() ? 0.062 : 0
  private readonly platformViewOffsetY = isTouchDevice() ? -0.05 : 0
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
    // Combat GLBs may not be loaded yet (menu idle) — equip on match prepare.
    if (this.equipWeaponMesh('AK47', false)) {
      player.setWeapon('AK47')
      this.fpsMesh?.holdPoseAt(0)
    } else {
      player.setWeapon('AK47')
    }
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
    const glm = Game.getInstance().globalLoadingManager
    const cached = this.weaponCache.get(key)
    if (cached) {
      if (key === 'AWP') {
        const root = cached.mesh as unknown as THREE.Object3D
        if (!root.getObjectByName('AwpViewProp')) this.attachAwpProp(cached)
      }
      if (key === 'Butterfly') {
        const root = cached.mesh as unknown as THREE.Object3D
        if (!root.getObjectByName(BUTTERFLY_KNIFE_PROP)) this.attachButterflyKnife(cached)
      }
      return cached
    }

    const source = glm.loadableMeshs.get(key)
    if (!source) return null
    const mesh = source.clone() as FPSMesh
    mesh.init()
    if (key === 'AWP') this.attachAwpProp(mesh)
    if (key === 'Butterfly') this.attachButterflyKnife(mesh)
    if (key === 'AK47') {
      mesh.holdPoseAt(0)
    } else {
      for (const animName of ['Shoot', 'Reload', 'Switch']) {
        if (mesh.animations.has(animName)) mesh.playAnimation(animName)
      }
      mesh.mixer?.stopAllAction()
      mesh.mixer?.setTime(0)
    }
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

    // Keep the original seat relative to the Galil hands (grip alignment).
    // Screen placement is handled by AWP viewmodelOffset instead.
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

  /** Seat CS 1.6 butterfly blade on M9 hands (Root-bone attach, same flow as AWP). */
  private attachButterflyKnife(fps: FPSMesh): void {
    const root = fps.mesh as unknown as THREE.Object3D
    if (root.getObjectByName(BUTTERFLY_KNIFE_PROP)) return

    const prop = Game.getInstance().globalLoadingManager.createButterflyKnifeProp()
    if (!prop) {
      console.warn('[Butterfly] createButterflyKnifeProp failed — is butterfly_knife.mdl loaded?')
      return
    }

    if (!seatKnifePropOnHands(prop, root)) {
      console.warn('[Butterfly] could not find Armature/Root seat bone')
    }
    holdKnifeDrawStart(root)
    setKnifePropVisible(root, false)
  }

  /**
   * Editor FPS viewmodels — AK uses the same AKM pack as the main game.
   * Butterfly = M9 hands + CS 1.6 MDL knife prop.
   */
  public equipEditorWeapon(key: string): boolean {
    const normalized =
      key === 'AK' || key === 'AK47'
        ? 'AK'
        : key === 'AWP'
          ? 'AWP'
          : key === 'Butterfly'
            ? 'Butterfly'
            : 'Usp'

    if (normalized === 'AK') {
      const already = this.isAkmFps()
      if (!already) {
        const ok = this.equipWeaponMesh('AK47', false)
        if (!ok) return false
      }
      this.player.setWeapon('AK47')
      this.fpsMesh?.holdPoseAt(0)
      this.startAkDrawUp()
      return true
    }

    if (normalized === 'AWP') {
      const ok = this.equipWeaponMesh('AWP', false)
      if (!ok) return false
      this.player.setWeapon('AWP')
      return true
    }

    if (normalized === 'Butterfly') {
      this.invalidateWeaponCache('Butterfly')
      const ok = this.equipWeaponMesh('Butterfly', true)
      if (!ok) return false
      this.player.setWeapon('Butterfly')
      if (this.fpsMesh) this.handleWeaponSwitch()
      return true
    }

    const already = this.fpsMesh?.key === 'Usp'
    if (!already) {
      const ok = this.equipWeaponMesh('Usp', true)
      if (!ok) return false
      this.player.setWeapon('Usp')
      return true
    }
    this.player.setWeapon('Usp')
    this.handleWeaponSwitch()
    return true
  }

  /** Live seat offset for the equipped viewmodel (what /editormode nudges). */
  public getViewmodelSeat(): Vector3D | null {
    return this.fpsMesh?.viewmodelOffset ?? null
  }

  public nudgeViewmodelSeat(axis: 'x' | 'y' | 'z', delta: number): void {
    const seat = this.fpsMesh?.viewmodelOffset
    if (!seat) return
    seat[axis] += delta
  }

  public setViewmodelSeat(x: number, y: number, z: number): void {
    const seat = this.fpsMesh?.viewmodelOffset
    if (!seat) return
    seat.set(x, y, z)
  }

  /** Live butterfly knife prop seat (Root-bone local — hands stay put). */
  public nudgeKnifeProp(axis: 'x' | 'y' | 'z', delta: number): boolean {
    if (this.fpsMesh?.key !== 'Butterfly') return false
    const root = this.fpsMesh.mesh as unknown as THREE.Object3D
    const prop = getKnifeProp(root)
    if (!prop) return false
    nudgeKnifePropPosition(prop, axis, delta)
    return true
  }

  public nudgeKnifePropSize(delta: number): boolean {
    if (this.fpsMesh?.key !== 'Butterfly') return false
    const root = this.fpsMesh.mesh as unknown as THREE.Object3D
    const prop = getKnifeProp(root)
    if (!prop) return false
    nudgeKnifePropScale(prop, delta)
    return true
  }

  public resetKnifePropTune(): boolean {
    if (this.fpsMesh?.key !== 'Butterfly') return false
    const root = this.fpsMesh.mesh as unknown as THREE.Object3D
    const prop = getKnifeProp(root)
    if (!prop) return false
    resetKnifePropSeat(prop)
    return true
  }

  public getKnifePropTuneState(): { x: number; y: number; z: number; scale: number } | null {
    if (this.fpsMesh?.key !== 'Butterfly') return null
    const root = this.fpsMesh.mesh as unknown as THREE.Object3D
    const prop = getKnifeProp(root)
    if (!prop) return null
    const tune = getKnifePropTune(prop)
    return {
      x: tune.position.x,
      y: tune.position.y,
      z: tune.position.z,
      scale: tune.scaleTune,
    }
  }

  public getKnifePropCopyText(): string {
    const tune = this.getKnifePropTuneState()
    if (!tune) return ''
    const rot = BUTTERFLY_KNIFE_SEAT.rotation
    return (
      `// Butterfly knife prop seat (MDLKnifeProp.ts)\n` +
      `position: new THREE.Vector3(${tune.x.toFixed(4)}, ${tune.y.toFixed(4)}, ${tune.z.toFixed(4)}),\n` +
      `rotation: new THREE.Euler(${rot.x.toFixed(4)}, ${rot.y.toFixed(4)}, ${rot.z.toFixed(4)}, 'XYZ'),\n` +
      `scaleMul: ${(BUTTERFLY_KNIFE_SEAT.scaleMul * tune.scale).toFixed(4)},`
    )
  }

  public nudgeWeaponRotation(axis: 'x' | 'y' | 'z', deltaRad: number): void {
    this.weaponRotation[axis] += deltaRad
  }

  public resetWeaponRotation(): void {
    this.weaponRotation.set(0, 0, 0)
  }

  /** Same-slot re-press: play switch/draw without rebuilding the mesh. */
  public replayWeaponSwitch(logicKey: string): void {
    if (this.isAkmFps() || logicKey === 'AK47') {
      this.fpsMesh?.holdPoseAt(0)
      this.startAkDrawUp()
      return
    }
    this.handleWeaponSwitch()
  }

  /** Drop a pooled viewmodel so the next equip rebuilds from the registry. */
  public invalidateWeaponCache(key: string): void {
    const prev = this.weaponCache.get(key)
    if (prev && this.fpsMesh === prev) {
      this.removeMesh()
      this.fpsMesh = null
    }
    this.weaponCache.delete(key)
  }

  /**
   * Swap to a cached weapon mesh (no mid-match SkeletonUtils.clone).
   * @param playSwitchAnim false when warming / initial equip
   */
  public equipWeaponMesh(key: string, playSwitchAnim = true): boolean {
    if (key === 'Butterfly' && !mapHasButterflyKnife(Game.getInstance().activeMapId)) {
      key = 'Knife'
    }
    const mesh = this.getOrCreateWeaponMesh(key)
    if (!mesh) return false
    if (this.fpsMesh === mesh) {
      if (playSwitchAnim) this.handleWeaponSwitch()
      return true
    }
    this.setMesh(mesh, playSwitchAnim)
    return true
  }

  /** Pre-init AK / USP / AWP + compile viewmodel shaders before combat */
  public warmWeapons(renderer: THREE.WebGLRenderer): void {
    const keys = ['AK47', 'Usp', 'Butterfly', 'AWP']
    const meshes: THREE.Object3D[] = []
    for (const key of keys) {
      const mesh = this.getOrCreateWeaponMesh(key)
      if (mesh?.mesh) meshes.push(mesh.mesh)
    }
    this.game.renderer.viewmodelRenderer.warm(renderer, meshes)
    // Build + lay out the AWP scope DOM now, not on the first right-click
    this.ensureScopeOverlay().getBoundingClientRect()
    // Restore currently equipped gun under the camera
    if (this.fpsMesh?.mesh) {
      this.viewmodelCamera.add(this.fpsMesh.mesh)
      this.fpsMesh.addLights(this.viewmodelLights)
      this.show()
    }
  }

  /** Detach viewmodels before the loader disposes shared combat GLBs. */
  public releaseCombatMeshes(
    seenGeo: Set<THREE.BufferGeometry> = new Set(),
    seenMat: Set<THREE.Material> = new Set(),
    seenTex: Set<THREE.Texture> = new Set()
  ): void {
    this.clearScope(false)
    this.removeMesh()
    for (const mesh of this.weaponCache.values()) {
      if (mesh?.mesh) LoadableMesh.disposeObject3D(mesh.mesh, seenGeo, seenMat, seenTex)
    }
    this.weaponCache.clear()
    this.fpsMesh = null
  }

  /** Rebuild viewmodels after combat GLBs are reloaded for a new match. */
  public rebuildAfterCombatReload(): void {
    this.weaponCache.clear()
    this.fpsMesh = null
    if (!this.equipWeaponMesh('AK47', false)) return
    this.player.setWeapon('AK47')
    const live = this.fpsMesh as FPSMesh | null
    live?.holdPoseAt(0)
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
    const key = new THREE.PointLight(0xfff2e6, 5.4, 4.5, 1.35)
    key.position.set(0.14, 0.2, 0.36)
    key.castShadow = false

    const fill = new THREE.PointLight(0xc8dcff, 2.6, 4, 1.5)
    fill.position.set(-0.24, 0.07, 0.2)
    fill.castShadow = false

    // Rakes along the barrel so the top of the receiver reads instead of going flat black
    const rim = new THREE.PointLight(0xffd9b0, 2.2, 3.2, 1.6)
    rim.position.set(0.05, 0.3, -0.28)
    rim.castShadow = false

    const ambient = new THREE.AmbientLight(0xffffff, 1.05)

    this.viewmodelLights = [key, fill, rim, ambient]
  }

  public setMesh(mesh: LoadableMesh, playSwitchAnim = true): void {
    this.cancelButterflyAnims()
    this.clearScope(false)
    this.removeMesh()
    this.fpsMesh = mesh as FPSMesh
    if (!this.fpsMesh.mixer) {
      this.fpsMesh.init()
    }
    if (this.fpsMesh.key === 'Butterfly') {
      this.ensureButterflyKnifeProp(this.fpsMesh)
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
    else if (this.isAkmFps()) this.fpsMesh.holdPoseAt(0)
  }

  /** Flip viewmodel between right / left hand */
  public toggleHands(): void {
    this.handSide = this.handSide === 1 ? -1 : 1
    this.applyHandSide()
  }

  public getHandSide(): 1 | -1 {
    return this.handSide
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

  /** Muzzle flash follows the active hand (flips with H / SwitchHands). */
  protected getMuzzleOrigin(): Vector3D {
    const eye = this.player.position.clone().add(new Vector3D(0, this.player.eyeOffsetY, 0))
    const direction = this.player.lookingDirection.clone().normalize()
    // cross(up, look) points screen-left when looking down -Z; negate so +handSide = gun side
    const side = new Vector3D().crossVectors(new Vector3D(0, 1, 0), direction).normalize()
    return eye
      .add(direction.clone().multiplyScalar(0.9))
      .add(side.multiplyScalar(-0.22 * this.handSide))
      .add(new Vector3D(0, -0.12, 0))
  }

  private initViewmodelPosition(): void {
    if (!this.fpsMesh?.mesh) return
    this.fpsMesh.mesh.position.copy(this.weaponOffset)
  }
  update(dt: number): void {
    super.update(dt)
    this.updateFovTransition(dt)

    this.viewmodelCamera.quaternion.copy(this.camera.quaternion)
    this.viewmodelCamera.fov =
      this.scopeLevel > 0 ? this.baseFov : (this.camera as THREE.PerspectiveCamera).fov
    this.viewmodelCamera.updateProjectionMatrix()

    if (!this.fpsMesh?.mesh) return

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
    if (this.fpsMesh.key === 'Butterfly') {
      updateKnifeProp(this.fpsMesh.mesh as unknown as THREE.Object3D, dt)
    }
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

    // Draw-up from below → ready (AK only — CS knife draw is in the MDL)
    let drawY = 0
    let drawPitch = 0
    if (this.akDrawT > 0) {
      this.akDrawT = Math.max(0, this.akDrawT - dt)
      const u = 1 - this.akDrawT / FPSRenderer.AK_DRAW_DUR
      const e = 1 - Math.pow(1 - u, 3)
      drawY = -0.58 * (1 - e)
      drawPitch = 0.42 * (1 - e)
    }

    if (this.fpsMesh.key === 'Butterfly') {
      this.syncButterflyKnifeVisibility()
    }

    // Editor AK shoot kick — ease back (linear decay feels less "snap")
    let kickPitch = 0
    let kickZ = 0
    if (this.akShootKick > 0) {
      this.akShootKick = Math.max(0, this.akShootKick - dt * 2.4)
      const k = this.akShootKick
      kickPitch = 0.036 * k
      kickZ = 0.006 * k
    }

    // Jump/fall tip — per-frame offset only (never accumulate into bobbingAcc)
    const jumpPitch = Math.max(
      -Math.PI / 128,
      Math.min(Math.PI / 90, this.player.velocity.y / 3200)
    )

    this.fpsMesh.mesh.rotation.x =
      -this.weaponBobbingAcc.x + this.weaponRotation.x + drawPitch + kickPitch + jumpPitch
    this.fpsMesh.mesh.rotation.y = -this.weaponBobbingAcc.y + this.weaponRotation.y
    this.fpsMesh.mesh.rotation.z = -this.weaponBobbingAcc.z + this.weaponRotation.z

    const spd = Math.hypot(this.player.velocity.x, this.player.velocity.z)
    const moveAmp = Math.min(1, spd / 8)
    const bobbingAmount = Math.sin(this.moveEffect.y) * this.bobbingAmount * (0.55 + moveAmp * 0.7)
    const idleSwayX =
      Math.sin(this.idleSwayTime * 1.15) * 0.0028 + Math.sin(this.idleSwayTime * 2.4) * 0.0009
    const idleSwayY =
      Math.cos(this.idleSwayTime * 0.85) * 0.0021 + Math.cos(this.idleSwayTime * 1.9) * 0.0007
    // Slight dip while airborne, recover on ground — not the weapon draw-up
    const airY = this.player.isOnGround
      ? 0
      : Math.min(0.04, Math.max(-0.06, -this.player.velocity.y * 0.004))
    this.fpsMesh.mesh.position.x =
      (this.weaponOffset.x + this.fpsMesh.viewmodelOffset.x + idleSwayX) * this.handSide +
      this.platformViewOffsetX
    this.fpsMesh.mesh.position.y =
      this.weaponOffset.y +
      this.fpsMesh.viewmodelOffset.y +
      this.platformViewOffsetY +
      bobbingAmount +
      Math.sin(this.moveEffect.y) / 50 +
      idleSwayY +
      drawY +
      airY
    this.fpsMesh.mesh.position.z =
      this.weaponOffset.z + this.fpsMesh.viewmodelOffset.z + this.recoilEffect + kickZ

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
        position: fixed; inset: 0; z-index: 26; pointer-events: none;
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
    if (!this.fpsMesh?.mesh) return
    this.viewmodelCamera.add(this.fpsMesh.mesh)
  }
}
