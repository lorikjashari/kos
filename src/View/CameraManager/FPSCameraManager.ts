import * as THREE from 'three'
import { Player } from '../../Core/Player'
import { Vector3D } from '../../Core/Vector'
import { lerp } from '../../Core/MathUtils'
import { getRecoilKick } from '../../Core/Weapon'
import { Game } from '../../Game'
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

  private wasDead = false
  private deathFallSide = 1
  private deathStartY = 0
  private deathStartPitch = 0
  private deathStartRoll = 0
  private readonly deathFallDuration = 0.9
  private readonly deathGroundEye = 0.22

  constructor(player: Player, camera: THREE.PerspectiveCamera) {
    super(player, camera)
  }

  public setLeanDirection(direction: number): void {
    this.leanDirection = direction
  }

  private getIdleSwayRoll(): number {
    return Math.sin(this.idlePhase * 1.1) * IDLE_SWAY_ROLL
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
    this.deathStartPitch = this.aimPitch + this.punchPitch + this.sprayPitch
    this.deathStartRoll = this.roll + this.getIdleSwayRoll()
    this.punchPitch = 0
    this.punchYaw = 0
    this.sprayPitch = 0
    this.sprayYaw = 0
    this.player.recoilIndex = 0
  }

  private applyDeathView(_dt: number): void {
    const t = easeOutCubic(this.player.deathAge / this.deathFallDuration)
    const groundY = this.player.position.y + this.deathGroundEye
    const camY = this.deathStartY + (groundY - this.deathStartY) * t
    // Tip forward toward the floor + roll onto one side
    const pitch = this.deathStartPitch + (0.72 - this.deathStartPitch) * t
    const roll = this.deathStartRoll + this.deathFallSide * (Math.PI / 2.05) * t

    this.camera.position.set(this.player.position.x, camY, this.player.position.z)
    this.euler.set(pitch, this.aimYaw, roll, 'YXZ')
    this.camera.quaternion.setFromEuler(this.euler)
  }

  private applyView(): void {
    if (!this.aimInitialized) this.syncAimFromCamera()

    this.euler.set(
      this.aimPitch + this.punchPitch + this.sprayPitch,
      this.aimYaw + this.punchYaw + this.sprayYaw,
      this.roll + this.getIdleSwayRoll(),
      'YXZ'
    )
    this.euler.x = Math.max(PI_2 - maxPolarAngle, Math.min(PI_2 - minPolarAngle, this.euler.x))
    this.camera.quaternion.setFromEuler(this.euler)

    // Hitscan follows recovered aim + current spray (not temporary punch)
    const shootEuler = new THREE.Euler(
      this.aimPitch + this.sprayPitch,
      this.aimYaw + this.sprayYaw,
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
      this.applyDeathView(dt)
      return
    }

    if (this.wasDead) {
      this.wasDead = false
      this.roll = 0
      this.resetRecoil()
    }

    this.idlePhase += dt

    const targetRoll = this.leanDirection * LEAN_ANGLE
    this.roll = lerp(this.roll, targetRoll, Math.min(1, dt * 10))

    this.camera.position.set(
      this.player.position.x,
      this.player.position.y + this.player.eyeOffsetY,
      this.player.position.z
    )

    // Fast visual punch recovery (CS view kick)
    const punchRecover = Math.min(1, dt * 14)
    this.punchPitch = lerp(this.punchPitch, 0, punchRecover)
    this.punchYaw = lerp(this.punchYaw, 0, punchRecover)

    // Spray recovers when not firing so single shots return to look direction
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

  public onMouseMove(event) {
    if (this.player.isDead) return
    super.onMouseMove(event)
    if (!this.aimInitialized) this.syncAimFromCamera()

    var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0
    var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0

    this.aimYaw -= movementX * 0.0015
    this.aimPitch -= movementY * 0.0015
    this.aimPitch = Math.max(PI_2 - maxPolarAngle, Math.min(PI_2 - minPolarAngle, this.aimPitch))
    this.applyView()
  }

  public getObject() {
    return this.camera
  }

  public getDirection(): Vector3D {
    return this.player.lookingDirection.clone()
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
