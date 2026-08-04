import * as THREE from 'three'
import { Player } from '../../Core/Player'
import { Vector3D } from '../../Core/Vector'
import { lerp } from '../../Core/MathUtils'
import { getRecoilKick } from '../../Core/Weapon'
import { Game } from '../../Game'
import { FPSRenderer } from '../Renderer/PlayerRenderer/FPSRenderer'
import { CameraManager } from './CameraManager'

const PI_2 = Math.PI / 2
const minPolarAngle = 0
const maxPolarAngle = Math.PI
const LEAN_ANGLE = Math.PI / 10
const IDLE_SWAY_ROLL = 0.006

/** Ease out cubic — fast fall, soft settle on the ground */
function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t))
  return 1 - u * u * u
}

/**
 * KoS aim:
 * - Mouse controls base aim (where crosshair / shots go)
 * - Recoil adds temporary view punch that recovers
 * - Spray offset climbs while firing, then recovers when you stop
 * - On death: POV drops to the ground with a side roll
 */
export class FPSCameraManager extends CameraManager {
  private euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private roll = 0
  private leanDirection = 0
  private idlePhase = 0

  private aimPitch = 0
  private aimYaw = 0
  private punchPitch = 0
  private punchYaw = 0
  private sprayPitch = 0
  private sprayYaw = 0
  private aimInitialized = false

  private scopeSwayPitch = 0
  private scopeSwayYaw = 0
  private scopeSwayPhase = 0

  private wasDead = false
  private deathFallSide = 1
  private deathStartY = 0
  private deathStartPitch = 0
  private deathStartRoll = 0
  private readonly deathFallDuration = 0.9
  private readonly deathGroundEye = 0.22
  private spectateBot: import('../../Core/TrainingBot').TrainingBot | null = null
  private spectateFreecam = false

  constructor(player: Player, camera: THREE.PerspectiveCamera) {
    super(player, camera)
  }

  public setSpectateTarget(bot: import('../../Core/TrainingBot').TrainingBot): void {
    this.spectateBot = bot
    this.spectateFreecam = false
  }

  public setSpectateFreecam(on: boolean): void {
    this.spectateFreecam = on
    if (on) this.spectateBot = null
  }

  public clearSpectateTarget(): void {
    this.spectateBot = null
    this.spectateFreecam = false
  }

  public setLeanDirection(direction: number): void {
    this.leanDirection = direction
  }

  private getIdleSwayRoll(): number {
    return Math.sin(this.idlePhase * 1.1) * IDLE_SWAY_ROLL
  }

  private updateScopeSway(dt: number): void {
    const renderer = Game.getInstance().currentPlayer?.renderer
    const scoped = renderer instanceof FPSRenderer && renderer.isScoped()
    if (!scoped) {
      this.scopeSwayPitch = lerp(this.scopeSwayPitch, 0, Math.min(1, dt * 8))
      this.scopeSwayYaw = lerp(this.scopeSwayYaw, 0, Math.min(1, dt * 8))
      return
    }

    this.scopeSwayPhase += dt
    const speed = Math.sqrt(
      this.player.velocity.x * this.player.velocity.x + this.player.velocity.z * this.player.velocity.z
    )
    const stillFactor = 1 - Math.min(1, speed / 10) * 0.65
    const levelMult = renderer.getScopeLevel() === 2 ? 1.15 : 1
    const pitchAmp = 0.0022 * stillFactor * levelMult
    const yawAmp = 0.0016 * stillFactor * levelMult
    const p = this.scopeSwayPhase
    this.scopeSwayPitch =
      (Math.sin(p * 0.72) * 0.55 + Math.sin(p * 1.85) * 0.3 + Math.sin(p * 3.1) * 0.15) * pitchAmp
    this.scopeSwayYaw =
      (Math.cos(p * 0.58) * 0.5 + Math.sin(p * 1.42) * 0.35 + Math.cos(p * 2.6) * 0.15) * yawAmp
  }

  private syncAimFromCamera(): void {
    this.euler.setFromQuaternion(this.camera.quaternion)
    this.aimPitch = this.euler.x
    this.aimYaw = this.euler.y
    this.aimInitialized = true
  }

  private beginDeathCam(): void {
    if (!this.aimInitialized) this.syncAimFromCamera()
    this.deathFallSide = Math.random() < 0.5 ? -1 : 1
    this.deathStartY = this.player.position.y + this.player.eyeOffsetY
    this.deathStartPitch = this.aimPitch + this.punchPitch + this.sprayPitch + this.scopeSwayPitch
    this.deathStartRoll = this.roll + this.getIdleSwayRoll()
    this.punchPitch = 0
    this.punchYaw = 0
    this.sprayPitch = 0
    this.sprayYaw = 0
    this.scopeSwayPitch = 0
    this.scopeSwayYaw = 0
    this.player.recoilIndex = 0
  }

  private applyDeathView(_dt: number): void {
    const t = easeOutCubic(this.player.deathAge / this.deathFallDuration)
    const groundY = this.player.position.y + this.deathGroundEye
    const camY = this.deathStartY + (groundY - this.deathStartY) * t
    const pitch = this.deathStartPitch + (0.72 - this.deathStartPitch) * t
    const roll = this.deathStartRoll + this.deathFallSide * (Math.PI / 2.05) * t

    this.camera.position.set(this.player.position.x, camY, this.player.position.z)
    this.euler.set(pitch, this.aimYaw, roll, 'YXZ')
    this.camera.quaternion.setFromEuler(this.euler)
  }

  private applyView(): void {
    if (!this.aimInitialized) this.syncAimFromCamera()

    this.euler.set(
      this.aimPitch + this.punchPitch + this.sprayPitch + this.scopeSwayPitch,
      this.aimYaw + this.punchYaw + this.sprayYaw + this.scopeSwayYaw,
      this.roll + this.getIdleSwayRoll(),
      'YXZ'
    )
    this.euler.x = Math.max(PI_2 - maxPolarAngle, Math.min(PI_2 - minPolarAngle, this.euler.x))
    this.camera.quaternion.setFromEuler(this.euler)

    const shootEuler = new THREE.Euler(
      this.aimPitch + this.sprayPitch + this.scopeSwayPitch,
      this.aimYaw + this.sprayYaw + this.scopeSwayYaw,
      0,
      'YXZ'
    )
    shootEuler.x = Math.max(PI_2 - maxPolarAngle, Math.min(PI_2 - minPolarAngle, shootEuler.x))
    const q = new THREE.Quaternion().setFromEuler(shootEuler)
    this.player.lookingDirection = new Vector3D(0, 0, -1).applyQuaternion(q) as Vector3D
  }

  public showDebug(): void {
    const helper = new THREE.CameraHelper(this.camera)
    Game.getInstance().addToRenderer(helper)
  }

  public update(dt: number) {
    super.update(dt)

    if (this.player.isDead) {
      if (!this.wasDead) {
        this.beginDeathCam()
        this.wasDead = true
      }
      if (this.spectateBot || this.spectateFreecam) {
        this.applySpectateView(dt)
        return
      }
      this.applyDeathView(dt)
      return
    }

    if (this.wasDead) {
      this.wasDead = false
      this.roll = 0
      this.resetRecoil()
      this.clearSpectateTarget()
    }

    this.idlePhase += dt
    this.updateScopeSway(dt)

    const targetRoll = this.leanDirection * LEAN_ANGLE
    this.roll = lerp(this.roll, targetRoll, Math.min(1, dt * 10))

    this.camera.position.set(
      this.player.position.x,
      this.player.position.y + this.player.eyeOffsetY + this.player.viewOffsetY,
      this.player.position.z
    )

    const punchRecover = Math.min(1, dt * 14)
    this.punchPitch = lerp(this.punchPitch, 0, punchRecover)
    this.punchYaw = lerp(this.punchYaw, 0, punchRecover)

    if (this.player.canResetRecoil()) {
      const sprayRecover = Math.min(1, dt * 6)
      this.sprayPitch = lerp(this.sprayPitch, 0, sprayRecover)
      this.sprayYaw = lerp(this.sprayYaw, 0, sprayRecover)
      if (Math.abs(this.sprayPitch) < 0.0005) this.sprayPitch = 0
      if (Math.abs(this.sprayYaw) < 0.0005) this.sprayYaw = 0
      if (this.player.recoilIndex > 0 && Math.abs(this.sprayPitch) < 0.002) {
        this.player.recoilIndex = 0
      }
    }

    this.applyView()
  }

  private applySpectateView(_dt: number): void {
    if (!this.aimInitialized) this.syncAimFromCamera()
    const eyeY = 1.55
    if (this.spectateBot) {
      this.camera.position.set(
        this.spectateBot.position.x,
        this.spectateBot.position.y + eyeY,
        this.spectateBot.position.z
      )
      // Follow the teammate's facing; mouse still nudges via onMouseMove
      this.aimYaw = this.spectateBot.yaw
      this.aimPitch = this.spectateBot.aimPitch * 0.85
    } else if (this.spectateFreecam) {
      // Stay near the corpse; look freely
      this.camera.position.set(
        this.player.position.x,
        this.player.position.y + eyeY,
        this.player.position.z
      )
    }
    this.euler.set(this.aimPitch, this.aimYaw, 0, 'YXZ')
    this.camera.quaternion.setFromEuler(this.euler)
  }

  public onMouseMove(event) {
    // Allow look while spectating; block only on classic death cam
    if (this.player.isDead && !this.spectateBot && !this.spectateFreecam) return
    super.onMouseMove(event)
    if (!this.aimInitialized) this.syncAimFromCamera()

    var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0
    var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0

    const renderer = Game.getInstance().currentPlayer?.renderer
    const zoomed = renderer instanceof FPSRenderer && renderer.isScoped()
    const scale = CameraManager.getMouseScale(zoomed)
    this.aimYaw -= movementX * scale
    this.aimPitch -= movementY * scale
    this.aimPitch = Math.max(PI_2 - maxPolarAngle, Math.min(PI_2 - minPolarAngle, this.aimPitch))
    this.applyView()
  }

  public getObject() {
    return this.camera
  }

  public getDirection(): Vector3D {
    return this.player.lookingDirection.clone()
  }

  /** Base aim (no punch/spray) — used by local demo record/replay. */
  public getAimAngles(): { yaw: number; pitch: number } {
    if (!this.aimInitialized) this.syncAimFromCamera()
    return { yaw: this.aimYaw, pitch: this.aimPitch }
  }

  public setAimAngles(yaw: number, pitch: number): void {
    this.aimYaw = yaw
    this.aimPitch = Math.max(PI_2 - maxPolarAngle, Math.min(PI_2 - minPolarAngle, pitch))
    this.punchPitch = 0
    this.punchYaw = 0
    this.sprayPitch = 0
    this.sprayYaw = 0
    this.aimInitialized = true
    this.applyView()
  }

  /** CS kick: temporary punch + spray climb; punch recovers so view returns. */
  public createRecoil(): void {
    if (this.player.isDead) return
    if (!this.aimInitialized) this.syncAimFromCamera()
    const kick = getRecoilKick(this.player.currentWeapon, this.player.recoilIndex)

    // Visual punch (recovers quickly)
    this.punchPitch += kick.pitch * 1.15
    this.punchYaw += kick.yaw * 1.15

    // Spray climbs while holding fire; recovers when you stop
    this.sprayPitch += kick.pitch * 0.35
    this.sprayYaw += kick.yaw * 0.35

    this.player.recoilIndex++
    this.applyView()
  }

  public resetRecoil(): void {
    this.player.recoilIndex = 0
    this.punchPitch = 0
    this.punchYaw = 0
    this.sprayPitch = 0
    this.sprayYaw = 0
    this.applyView()
  }
}
