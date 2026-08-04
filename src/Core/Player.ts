import { IUpdatable } from '../Interface/IUpdatable'
import { Pawn } from './Pawn'
import { Vector2D, Vector3D } from './Vector'
import { Game } from '../Game'
import * as THREE from 'three'
import Ammo from 'ammojs-typed'
import { Physics } from '../Physics/Physics'
import { IBody } from '../Interface/IBody'
import { GroundRaycastProperty, HitscanProperty, HitscanResult } from '../Interface/utils'
import { AmmoInstance } from '../Physics/Ammo'
import { WeaponConfig, getWeaponConfig } from './Weapon'
import { raycastBotMeshes } from './BotMeshHit'
import { damageAtRange } from './BodyPart'
import { FPSMesh } from '../View/Mesh/FPSMesh'
import { FPSRenderer } from '../View/Renderer/PlayerRenderer/FPSRenderer'

/** World Y at or below this → fall through map / void death */
const VOID_DEATH_Y = -30

// Good reference : https://github.com/222464/EvolvedVirtualCreaturesRepo/blob/master/VirtualCreatures/Volumetric_SDL/Source/SceneObjects/Physics/DynamicCharacterController.cpp
export class Player extends Pawn implements IUpdatable {
  public velocity: Vector3D = new Vector3D(0, 0, 0)
  public lookingDirection: Vector3D = Vector3D.ZERO()
  public lastShootTimeStamp = new Date()
  /** ms since last shot — advanced with dt so recoil reset is framerate-stable */
  private recoilIdleMs = 0
  private jumpRechargeTime = 100 // ms — half previous delay
  private jumpRechargeTimer = 0
  /** After jumping, ignore ground ray briefly so sticky rays don't cancel the jump */
  private jumpIgnoreGroundMs = 0
  private readonly jumpIgnoreGroundDuration = 42
  /** Must leave the ground after a jump before another is allowed (stops slope micro-jumps) */
  private hasLeftGroundSinceJump = true
  public deceleration = new Vector3D(0.95, 1, 0.95)
  public airDeceleration = new Vector3D(0.98, 1, 0.98)

  // --- Movement tuning ---
  private readonly groundFriction = 6
  /** Friction floor so low speeds still stop quickly (CS sv_stopspeed) */
  private readonly stopSpeed = 2
  private readonly groundAccel = 14
  private readonly airAccel = 14
  /** Air control is capped low so jumps preserve momentum instead of being steered */
  private readonly airSpeedCapFactor = 0.3
  /** Horizontal speed ceiling as a multiple of base run speed */
  private readonly maxSpeedFactor = 2.4
  /** No ground friction for this long after touchdown (bunny hop window) */
  private readonly landingFrictionGrace = 70
  private landingGraceMs = 0
  /** Gravity on top of the world's, kept for the punchy jump arc */
  private readonly extraGravity = 9.81 * 0.5

  // --- Ground follow tuning ---
  /** Steepest walkable surface (~53°); anything steeper is not ground */
  private readonly minWalkableNy = 0.6
  /** How far below the feet we still consider ourselves standing (and snap down) */
  private readonly groundSnapDown = 0.6
  /** Rises bigger than this are left to tryStepUp */
  private readonly maxSnapUp = 0.35
  private readonly groundSkin = 0.02
  /** Blocks the down-snap right after a step-up so the climb isn't cancelled */
  private noSnapDownMs = 0
  private readonly stepUpSnapBlock = 90
  /** Vertical offset the camera lags behind by, so steps don't pop the view */
  public viewOffsetY = 0
  private readonly maxViewOffset = 1.2
  private readonly viewSmoothRate = 16
  /** Collision capsule dimensions (crouching only changes the eye height) */
  private readonly shapeRadius: number
  private readonly shapeHalfCyl: number

  private moveDirection: Vector3D = Vector3D.ZERO()
  public speed = 100
  private maxSpeed = 100
  public rateOfFire = 100
  public currentWeapon: WeaponConfig = getWeaponConfig('AK47')
  /** Match primary from loadout picker — bound to key 1 */
  public primaryWeaponKey: 'AK47' | 'AWP' = 'AK47'
  public ammoInMag = 30
  public isReloading = false
  private reloadTimer = 0
  /** Mag ammo remembered per weapon when switching (KoS) */
  private ammoByWeapon: Record<string, number> = {
    AK47: 30,
    Usp: 12,
    Knife: 0,
    AWP: 10,
  }
  /** Spare rounds outside the mag, per weapon. Reloads draw from here. */
  private reserveByWeapon: Record<string, number> = {}
  /** Kevlar every spawn — halves incoming damage until it is chewed through */
  public static readonly SPAWN_ARMOR = 50
  public health = 100
  public armor = Player.SPAWN_ARMOR
  public isWalking = false
  public isCrouching = false
  public recoilIndex = 0
  public wishSpeedScale = 1
  public moveIntentScale = 1
  /** Per-map multiplier (Dust II is large — needs higher base speed) */
  public mapSpeedScale = 1
  public isCurrentPlayer = false
  public isOnGround = false
  public isDead = false
  public isAlive = true
  /** Seconds left until auto-respawn while dead */
  public deathTimer = 0
  /** How long we've been dead this life (for camera / UI) */
  public deathAge = 0
  public readonly deathRespawnDelay = 4.0
  private spawnPoint = new Vector3D(0, 5, 8)

  public jumpVelocity = 200
  public capsuleDimension = new Vector2D(1, 2)
  private standCapsuleY = 2
  private crouchCapsuleY = 1.05
  private standEyeOffset = (2 * 2.5) / 3
  private crouchEyeOffset = 0.95
  private world!: Ammo.btDynamicsWorld
  private worldGravityVec?: Ammo.btVector3
  private zeroGravityVec?: Ammo.btVector3
  private bodyGravityEnabled = true
  public eyeOffsetY = (this.capsuleDimension.y * 2.5) / 3
  constructor(position: Vector3D) {
    super(position, Vector3D.ZERO())
    this.spawnPoint = position.clone()
    this.shapeRadius = this.capsuleDimension.x
    this.shapeHalfCyl = this.capsuleDimension.y * 0.5
    const shape = this.createShape(
      new Vector3D(this.capsuleDimension.x, this.capsuleDimension.y, this.capsuleDimension.x)
    )
    const body = this.createBody(shape, position)
    this.setBody(body)
  }
  protected createShape(size: Vector3D): Ammo.btCollisionShape {
    return new AmmoInstance!.btCapsuleShape(size.x, size.y)
  }
  protected createBody(shape: Ammo.btCollisionShape, position: Vector3D): Ammo.btRigidBody {
    const mass = 10
    const DISABLE_DEACTIVATION = 4
    const transform = new AmmoInstance!.btTransform()
    transform.setOrigin(new AmmoInstance!.btVector3(position.x, position.y, position.z))
    this.transform = transform
    const myMotionState = new AmmoInstance!.btDefaultMotionState(transform)

    const localInertia = new AmmoInstance!.btVector3(0, 0, 0)
    shape.calculateLocalInertia(mass, localInertia)
    const rbInfo = new AmmoInstance!.btRigidBodyConstructionInfo(mass, myMotionState, shape, localInertia)

    const vec3 = new AmmoInstance!.btVector3(0, 0, 0)

    const body = new AmmoInstance!.btRigidBody(rbInfo)
    body.setGravity(vec3)
    // No sleeping (or else setLinearVelocity won't work)
    body.setActivationState(DISABLE_DEACTIVATION)

    body.setFriction(0)
    body.setRestitution(0)
    // O.9, 0.9 for slower ramp
    body.setDamping(0.0, 0.0)
    body.setSleepingThresholds(0.0, 0.0)
    // Keep upright
    body.setAngularFactor(vec3)

    //body.setLinearFactor(vec3);
    body.setAngularFactor(vec3) // TODO: use the same ammo.vector3
    AmmoInstance!.destroy(vec3)
    return body
  }
  public getGroundRaycastProperties(): GroundRaycastProperty {
    return {
      initialLocalPos: new Vector3D(0, -(this.shapeHalfCyl + this.shapeRadius), 0),
      size: this.groundSnapDown,
    }
  }
  addToWorld(physics: Physics) {
    this.world = physics.world
    physics.add(this.body)
    // addRigidBody() overwrites the body gravity with the world's — capture it so we
    // can toggle gravity off while grounded (we drive vertical motion ourselves there)
    const g = physics.world.getGravity()
    this.worldGravityVec = new AmmoInstance!.btVector3(g.x(), g.y(), g.z())
    this.zeroGravityVec = new AmmoInstance!.btVector3(0, 0, 0)
  }

  /**
   * While standing, gravity would pull the capsule a fraction into the floor every
   * step and the solver would push it back out — a constant micro-bounce on slopes.
   */
  private setBodyGravityEnabled(enabled: boolean): void {
    if (!this.worldGravityVec || !this.zeroGravityVec) return
    if (enabled === this.bodyGravityEnabled) return
    this.body.setGravity(enabled ? this.worldGravityVec : this.zeroGravityVec)
    this.bodyGravityEnabled = enabled
  }
  prestep(dt: number) {
    this.moveDirection = Vector3D.ZERO()
  }

  /**
   * Read the body's authoritative transform. Actor.update() goes through the motion
   * state, which Bullet extrapolates by a fixed step — mixing that with the manual
   * transform writes below reads back positions we never set.
   */
  private syncPositionFromBody(): void {
    const origin = this.body.getWorldTransform().getOrigin()
    this.position.set(origin.x(), origin.y(), origin.z())
  }

  /** World Y of the capsule's lowest point (feet). */
  public getFeetY(): number {
    return this.position.y - this.shapeHalfCyl - this.shapeRadius
  }

  /** Height of the capsule above where it would rest on the given surface. */
  private groundGap(hitY: number, hitNy: number): number {
    const ny = Math.max(hitNy, this.minWalkableNy)
    return this.position.y - (hitY + this.shapeHalfCyl + this.shapeRadius / ny)
  }

  /**
   * Ground probe: one ray under the capsule axis (drives slope following) plus four
   * offset rays that only widen the grounded test so ledges/edges don't flicker.
   */
  private updateGroundState(): void {
    // Sticky ground ray still hits mid-jump — force airborne for a short window
    if (this.jumpIgnoreGroundMs > 0) {
      this.isOnGround = false
      this.hasGroundPlane = false
      this.hasLeftGroundSinceJump = true
      this.groundNx = 0
      this.groundNy = 1
      this.groundNz = 0
      return
    }

    // Reach further down while already walking so ramps / steps down are followed
    const probe = this.isOnGround ? this.groundSnapDown : 0.12
    const startY = this.position.y
    // A capsule rests radius/n.y above the point below it, so a steep ramp sits much
    // lower than the nominal feet — the ray has to allow for the worst walkable slope
    const endY =
      this.position.y - this.shapeHalfCyl - this.shapeRadius / this.minWalkableNy - probe

    const center = this.ammoRayHitFull(
      new Vector3D(this.position.x, startY, this.position.z),
      new Vector3D(this.position.x, endY, this.position.z)
    )

    let grounded = false
    this.hasGroundPlane = false

    if (center.hit && center.ny >= this.minWalkableNy && this.groundGap(center.y, center.ny) <= probe) {
      grounded = true
      this.hasGroundPlane = true
      this.groundY = center.y
      this.groundNx = center.nx
      this.groundNy = center.ny
      this.groundNz = center.nz
    } else {
      const r = this.shapeRadius * 0.55
      const offsets: Array<[number, number]> = [
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
      ]
      for (const [ox, oz] of offsets) {
        const hit = this.ammoRayHitFull(
          new Vector3D(this.position.x + ox, startY, this.position.z + oz),
          new Vector3D(this.position.x + ox, endY, this.position.z + oz)
        )
        if (!hit.hit || hit.ny < this.minWalkableNy) continue
        if (hit.y < this.getFeetY() - probe) continue
        // Standing on an edge: keep control, but never snap to a plane we're not centred on
        grounded = true
        this.groundNx = 0
        this.groundNy = 1
        this.groundNz = 0
        break
      }
    }

    if (!grounded) {
      this.hasLeftGroundSinceJump = true
      this.groundNx = 0
      this.groundNy = 1
      this.groundNz = 0
    }
    this.isOnGround = grounded
  }

  private ammoRayHit(
    from: Vector3D,
    to: Vector3D
  ): { hit: boolean; y: number } {
    const full = this.ammoRayHitFull(from, to)
    return { hit: full.hit, y: full.y }
  }

  private ammoRayHitFull(
    from: Vector3D,
    to: Vector3D
  ): { hit: boolean; y: number; nx: number; ny: number; nz: number } {
    const fromAmmo = from.toAmmo()
    const toAmmo = to.toAmmo()
    const cb = new AmmoInstance!.ClosestRayResultCallback(fromAmmo, toAmmo)
    this.world.rayTest(fromAmmo, toAmmo, cb)
    const hit = cb.hasHit()
    let y = 0
    let nx = 0
    let ny = 1
    let nz = 0
    if (hit) {
      const p = cb.get_m_hitPointWorld()
      y = p.y()
      const n = cb.get_m_hitNormalWorld()
      nx = n.x()
      ny = n.y()
      nz = n.z()
    }
    AmmoInstance!.destroy(fromAmmo)
    AmmoInstance!.destroy(toAmmo)
    AmmoInstance!.destroy(cb)
    return { hit, y, nx, ny, nz }
  }

  /**
   * Sit the capsule exactly where it geometrically rests on the surface under it.
   * A sphere of radius r on a plane whose normal is n has its centre r/n.y above the
   * point straight below it — using r instead sinks into ramps and the solver then
   * fights back, which is what made slopes stutter.
   */
  private snapToGround(): void {
    if (!this.isOnGround || !this.hasGroundPlane || this.jumpIgnoreGroundMs > 0) return

    const ny = Math.max(this.groundNy, this.minWalkableNy)
    const targetCenterY = this.groundY + this.shapeHalfCyl + this.shapeRadius / ny + this.groundSkin
    const dy = targetCenterY - this.position.y

    // Bigger rises belong to tryStepUp; bigger drops mean we're really airborne
    if (dy > this.maxSnapUp || dy < -this.groundSnapDown) return
    if (Math.abs(dy) < 1e-4) return
    // Just stepped onto a riser: the probe still sees the tread below us, so pulling
    // down here would undo the climb and stutter on every stair
    if (dy < 0 && this.noSnapDownMs > 0) return

    this.shiftVertically(dy)
  }

  /**
   * Teleport the body vertically and hand the delta to the view so the camera eases
   * into the new height instead of popping (stairs / curbs).
   */
  private shiftVertically(dy: number): void {
    const newY = this.position.y + dy
    this.setPosition(new Vector3D(this.position.x, newY, this.position.z))
    this.position.y = newY
    this.viewOffsetY = Math.max(-this.maxViewOffset, Math.min(this.maxViewOffset, this.viewOffsetY - dy))
  }

  /** Ease the stair-smoothing offset back to zero. */
  private decayViewOffset(dt: number): void {
    if (this.viewOffsetY === 0) return
    const keep = Math.exp(-this.viewSmoothRate * Math.max(dt, 1 / 240))
    this.viewOffsetY *= keep
    if (Math.abs(this.viewOffsetY) < 0.001) this.viewOffsetY = 0
  }

  /** Vertical speed that keeps XZ motion on the ground plane (strafe-safe). */
  private slopeAlignedY(vx: number, vz: number): number {
    if (!this.isOnGround || !this.hasGroundPlane) return 0
    const ny = this.groundNy
    if (ny >= 0.9999 || ny < this.minWalkableNy) return 0
    return (-this.groundNx * vx - this.groundNz * vz) / ny
  }

  /**
   * Climb stair risers / curbs. Disabled on slopes so it never fights ramp following.
   */
  private tryStepUp(): boolean {
    if (!this.isOnGround || this.jumpIgnoreGroundMs > 0) return false
    // On a real slope the ground follow already carries us up
    if (this.groundNy < 0.94) return false

    const mx = this.moveDirection.x
    const mz = this.moveDirection.z
    const moveLenSq = mx * mx + mz * mz
    if (moveLenSq < 1e-4) return false

    const inv = 1 / Math.sqrt(moveLenSq)
    const dirX = mx * inv
    const dirZ = mz * inv

    const radius = this.shapeRadius
    const halfCyl = this.shapeHalfCyl
    const feetY = this.getFeetY()
    const maxStep = 2.0
    const distances = [0.35, 0.55, 0.8, 1.05, 1.35]

    for (const forward of distances) {
      const ax = this.position.x + dirX * forward
      const az = this.position.z + dirZ * forward

      const down = this.ammoRayHitFull(
        new Vector3D(ax, feetY + maxStep + 0.25, az),
        new Vector3D(ax, feetY - 0.4, az)
      )
      if (!down.hit) continue

      const stepH = down.y - feetY
      if (stepH < 0.03 || stepH > maxStep) continue
      // Must land on a tread (flat). Sloped landings are ramps — ignore.
      if (down.ny < 0.9) continue

      const shin = this.ammoRayHit(
        new Vector3D(this.position.x, feetY + 0.08, this.position.z),
        new Vector3D(ax, feetY + 0.08, az)
      )
      // No riser + shallow rise = ramp sampling, not a stair
      if (!shin.hit) {
        if (stepH < 0.1) continue
        const slope = stepH / Math.max(forward, 0.01)
        if (slope < 0.65) continue
      }

      if (stepH > 1.65) {
        const fx = ax + dirX * 1.2
        const fz = az + dirZ * 1.2
        const flat = this.ammoRayHit(
          new Vector3D(fx, down.y + 0.75, fz),
          new Vector3D(fx, down.y - 0.4, fz)
        )
        if (flat.hit && Math.abs(flat.y - down.y) < 0.25) continue
      }

      const wall = this.ammoRayHit(
        new Vector3D(
          this.position.x + dirX * (radius * 0.15),
          feetY + stepH + 0.45,
          this.position.z + dirZ * (radius * 0.15)
        ),
        new Vector3D(ax, feetY + stepH + 0.45, az)
      )
      if (wall.hit) continue

      const headY = this.position.y + halfCyl + radius
      const ceiling = this.ammoRayHit(
        new Vector3D(ax, headY, az),
        new Vector3D(ax, headY + stepH + 0.25, az)
      )
      if (ceiling.hit) continue

      const nudge = Math.min(0.12, forward * 0.18)
      const nx = this.position.x + dirX * nudge
      const nz = this.position.z + dirZ * nudge
      this.setPosition(new Vector3D(nx, this.position.y, nz))
      this.position.x = nx
      this.position.z = nz
      this.shiftVertically(stepH + 0.05)
      this.noSnapDownMs = this.stepUpSnapBlock
      const lv = this.body.getLinearVelocity()
      if (lv.y() < 0) lv.setY(0)
      this.velocity.y = Math.max(0, this.velocity.y)
      this.isOnGround = true
      this.groundY = down.y
      this.groundNx = 0
      this.groundNy = 1
      this.groundNz = 0
      this.hasGroundPlane = true
      return true
    }
    return false
  }

  private tryStepUpCascade(): void {
    for (let i = 0; i < 4; i++) {
      if (!this.tryStepUp()) break
    }
  }
  private updateJumpRechargeTime(dt: number): void {
    if (this.jumpIgnoreGroundMs > 0) {
      this.jumpIgnoreGroundMs = Math.max(0, this.jumpIgnoreGroundMs - dt * 1000)
    }
    if (this.jumpRechargeTimer < this.jumpRechargeTime) {
      this.jumpRechargeTimer += dt * 1000
    }
  }

  /**
   * Quake/CS acceleration: only add speed along the wish direction, and only up to
   * `speedCap` measured along that direction. In the air the cap is small, which is
   * what lets air-strafing keep (and slightly grow) the speed carried off a jump.
   */
  private Accelerate(
    accelDir: Vector3D,
    velocity: Vector3D,
    wishSpeed: number,
    accel: number,
    dt: number,
    speedCap = wishSpeed
  ): void {
    const dirLenSq = accelDir.x * accelDir.x + accelDir.z * accelDir.z
    if (dirLenSq < 1e-6) return

    const currentSpeed = velocity.x * accelDir.x + velocity.z * accelDir.z
    const addSpeed = speedCap - currentSpeed
    if (addSpeed <= 0) return

    const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed)
    velocity.x += accelSpeed * accelDir.x
    velocity.z += accelSpeed * accelDir.z
  }

  private getWishSpeed(): number {
    return 10 * this.wishSpeedScale * this.mapSpeedScale
  }

  /** Ceiling on horizontal speed — bhop chains may exceed run speed, but not forever. */
  private getSpeedLimit(): number {
    return 10 * this.mapSpeedScale * this.maxSpeedFactor
  }

  /**
   * Ground friction (CS model). Skipped for a few ms after touchdown so a jump timed
   * on landing keeps the speed you came in with — that's what bunny hopping needs.
   */
  private applyGroundFriction(dt: number): void {
    if (this.landingGraceMs > 0) return
    const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z)
    if (speed < 0.05) {
      this.velocity.x = 0
      this.velocity.z = 0
      return
    }
    const control = Math.max(speed, this.stopSpeed)
    const drop = control * this.groundFriction * dt
    const scale = Math.max(0, speed - drop) / speed
    this.velocity.x *= scale
    this.velocity.z *= scale
  }

  public currentSpeedMagnitude = 0
  private groundNx = 0
  private groundNy = 1
  private groundNz = 0
  /** World Y of the surface directly under the capsule axis */
  private groundY = 0
  /** True when the centre probe found a surface we can align to */
  private hasGroundPlane = false

  update(dt: number): void {
    this.syncPositionFromBody()

    const wasOnGround = this.isOnGround
    this.updateGroundState()
    if (this.isOnGround && !wasOnGround) this.landingGraceMs = this.landingFrictionGrace
    this.setBodyGravityEnabled(!(this.isOnGround && this.hasGroundPlane))

    const wishSpeed = this.getWishSpeed()
    if (this.isOnGround) {
      this.applyGroundFriction(dt)
      this.Accelerate(this.moveDirection, this.velocity, wishSpeed, this.groundAccel, dt)
    } else {
      this.Accelerate(
        this.moveDirection,
        this.velocity,
        wishSpeed,
        this.airAccel,
        dt,
        wishSpeed * this.airSpeedCapFactor
      )
    }
    this.clampHorizontalSpeed(this.getSpeedLimit())

    // Sit exactly on the surface, then move along it (a flat floor gives slope Y = 0)
    this.snapToGround()

    const linearVelocity: Ammo.btVector3 = this.body.getLinearVelocity()
    // Supported by a plane we can align to → ride it; otherwise let gravity/solver decide
    const y =
      this.isOnGround && this.hasGroundPlane
        ? this.slopeAlignedY(this.velocity.x, this.velocity.z)
        : linearVelocity.y() - this.extraGravity * dt
    linearVelocity.setValue(this.velocity.x, y, this.velocity.z)
    this.velocity.y = y

    this.tryStepUpCascade()

    this.currentSpeedMagnitude = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
    )
    if (this.landingGraceMs > 0) this.landingGraceMs = Math.max(0, this.landingGraceMs - dt * 1000)
    if (this.noSnapDownMs > 0) this.noSnapDownMs = Math.max(0, this.noSnapDownMs - dt * 1000)
    this.updateJumpRechargeTime(dt)
    this.updateReload(dt)
    this.decayViewOffset(dt)
    this.recoilIdleMs += dt * 1000
  }

  /** After the physics step: re-probe and re-seat on the ground so the frame the
   * camera renders is the frame the body is actually standing on. */
  public postPhysics(dt: number): void {
    this.syncPositionFromBody()
    this.checkVoidDeath()

    const wasOnGround = this.isOnGround
    this.updateGroundState()
    if (this.isOnGround && !wasOnGround) this.landingGraceMs = this.landingFrictionGrace
    if (!this.isOnGround) return

    this.clampHorizontalSpeed(this.getSpeedLimit())
    this.snapToGround()

    if (!this.hasGroundPlane) return
    const slopeY = this.slopeAlignedY(this.velocity.x, this.velocity.z)
    this.body.getLinearVelocity().setY(slopeY)
    this.velocity.y = slopeY
  }

  /** Glitched under the map / fell off — die and let the normal respawn timer fire. */
  private checkVoidDeath(): void {
    if (this.isDead) return
    // No arena installed (boot / menu / map swap) — falling is expected, not a kill.
    const game = Game.getInstance()
    if (!game.matchStarted || !game.hasActiveMap()) return
    if (this.position.y > VOID_DEATH_Y) return
    this.takeDamage(99999, 'void')
    this.setVelocity(Vector3D.ZERO())
    const lv = this.body.getLinearVelocity()
    lv.setValue(0, 0, 0)
    this.setBodyGravityEnabled(false)
  }

  private updateReload(dt: number): void {
    if (!this.isReloading) return
    this.reloadTimer -= dt
    if (this.reloadTimer <= 0) {
      this.isReloading = false
      const key = this.currentWeapon.key
      const needed = this.currentWeapon.magazineSize - this.ammoInMag
      const taken = Math.min(needed, this.reserveAmmo(key))
      this.ammoInMag += taken
      this.reserveByWeapon[key] = this.reserveAmmo(key) - taken
      this.ammoByWeapon[key] = this.ammoInMag
      this.reloadTimer = 0
    }
  }

  public setWalking(walking: boolean): void {
    this.isWalking = walking
    this.updateSpeedScale()
  }

  /** Analog move intent 0..1 (mobile stick). Ignored while crouching / keyboard walk. */
  public setMoveIntentScale(scale: number): void {
    this.moveIntentScale = Math.max(0.2, Math.min(1, scale))
    this.updateSpeedScale()
  }

  public setCrouching(crouching: boolean): void {
    if (this.isCrouching === crouching) return
    this.isCrouching = crouching
    this.capsuleDimension.y = crouching ? this.crouchCapsuleY : this.standCapsuleY
    this.eyeOffsetY = crouching ? this.crouchEyeOffset : this.standEyeOffset
    this.updateSpeedScale()
  }

  private updateSpeedScale(): void {
    if (this.isCrouching) this.wishSpeedScale = 0.38
    else if (this.isWalking) this.wishSpeedScale = 0.55
    else this.wishSpeedScale = this.moveIntentScale
  }

  public setMapSpeedScale(scale: number): void {
    this.mapSpeedScale = Math.max(0.25, scale)
  }

  public reserveAmmo(weaponKey = this.currentWeapon.key): number {
    return Math.max(0, this.reserveByWeapon[weaponKey] ?? 0)
  }

  public addReserveAmmo(weaponKey: string, rounds: number): void {
    const cap = getWeaponConfig(weaponKey).reserveAmmo
    this.reserveByWeapon[weaponKey] = Math.min(cap, this.reserveAmmo(weaponKey) + Math.max(0, rounds))
  }

  public startReload(): boolean {
    if (this.isReloading) return false
    if (this.currentWeapon.fireMode === 'melee') return false
    if (this.ammoInMag >= this.currentWeapon.magazineSize) return false
    if (this.reserveAmmo() <= 0) return false
    this.isReloading = true
    this.reloadTimer = this.currentWeapon.reloadTime
    this.recoilIndex = 0
    return true
  }

  public tryAutoReload(): boolean {
    if (this.currentWeapon.fireMode === 'melee') return false
    if (this.ammoInMag > 0 || this.isReloading) return false
    return this.startReload()
  }
  private copyVelocity() {
    const vel = this.body.getLinearVelocity()
    this.velocity.setFromAmmo(vel)
  }
  private move(movementVector: THREE.Vector3) {
    this.moveDirection.add(Vector3D.fromThree(movementVector))
    this.moveDirection.normalize()
  }

  public moveForward(): void {
    const lookingDir = this.lookingDirection.clone().setY(0)
    lookingDir.normalize()
    this.move(lookingDir)
  }
  public moveBackward(): void {
    const lookingDir = this.lookingDirection.clone().setY(0)
    lookingDir.multiplyScalar(-1)
    this.move(lookingDir)
  }
  public moveLeft(): void {
    const vectorUp = new Vector3D(0, 1, 0)
    const lookingDir = this.lookingDirection.clone().setY(0)
    let movementVector = new Vector3D().crossVectors(vectorUp, lookingDir)
    this.move(movementVector)
  }
  public moveRight(): void {
    const vectorUp = new Vector3D(0, 1, 0)
    const lookingDir = this.lookingDirection.clone().setY(0)
    let movementVector = new Vector3D().crossVectors(vectorUp, lookingDir)
    movementVector.multiplyScalar(-1)
    this.move(movementVector)
  }
  /** Returns false if already holding that weapon (no re-equip) */
  public setWeapon(weaponKey: string): boolean {
    if (this.currentWeapon.key === weaponKey) return false

    // Remember mag for the weapon we're leaving
    this.ammoByWeapon[this.currentWeapon.key] = this.ammoInMag

    this.currentWeapon = getWeaponConfig(weaponKey)
    this.rateOfFire = this.currentWeapon.rateOfFire
    const saved = this.ammoByWeapon[weaponKey]
    this.ammoInMag =
      saved !== undefined ? saved : this.currentWeapon.fireMode === 'melee' ? 0 : this.currentWeapon.magazineSize
    this.ammoByWeapon[weaponKey] = this.ammoInMag
    this.isReloading = false
    this.reloadTimer = 0
    this.recoilIndex = 0
    return true
  }

  public canShoot(): boolean {
    const game = Game.getInstance()
    if (game.matchStarted && !game.isCombatLive()) return false
    if (this.isReloading) return false
    if (this.currentWeapon.fireMode !== 'melee' && this.ammoInMag <= 0) return false
    return new Date().getTime() - this.lastShootTimeStamp.getTime() > this.rateOfFire
  }

  public createHitscanPoints(range = this.currentWeapon.maxRange): HitscanProperty {
    const from = this.position.clone().add(new Vector3D(0, this.eyeOffsetY, 0))
    const to = new Vector3D().addVectors(from, this.lookingDirection.clone().multiplyScalar(range))
    return {
      from,
      to,
    }
  }

  /**
   * Cone half-angle in radians for this shot. A standing first shot is dead
   * accurate so precision aiming still rewards; running and spraying open it up,
   * which is what makes holding an angle and closing distance mean anything.
   */
  private currentSpread(): number {
    const weapon = this.currentWeapon
    if (weapon.fireMode === 'melee') return 0
    // A scoped AWP is a precision tool — never jitter it
    if (weapon.key === 'AWP') {
      const renderer = Game.getInstance().currentPlayer?.renderer
      if (renderer instanceof FPSRenderer && renderer.isScoped()) return 0
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    const moving = Math.min(1, speed / 8)
    const airborne = this.isOnGround ? 0 : 1
    const spray = Math.min(1, this.recoilIndex / 10)

    const base = weapon.baseSpread
    return base + moving * weapon.moveSpread + airborne * weapon.airSpread + spray * weapon.spraySpread
  }

  /** Cone half-angle in radians — for dynamic crosshair / HUD. */
  public getSpreadCone(): number {
    return this.currentSpread()
  }

  /** Random direction inside a cone around `dir`. */
  private applySpread(dir: Vector3D, spread: number): Vector3D {
    if (spread <= 0) return dir
    const up = Math.abs(dir.y) > 0.95 ? new Vector3D(1, 0, 0) : new Vector3D(0, 1, 0)
    const right = new Vector3D().crossVectors(dir, up).normalize()
    const trueUp = new Vector3D().crossVectors(right, dir).normalize()
    const angle = Math.random() * Math.PI * 2
    // sqrt keeps the distribution even across the disc instead of centre-heavy
    const radius = Math.sqrt(Math.random()) * spread
    return dir
      .clone()
      .add(right.multiplyScalar(Math.cos(angle) * radius))
      .add(trueUp.multiplyScalar(Math.sin(angle) * radius))
      .normalize()
  }

  public shoot(): HitscanResult {
    if (this.isDead) {
      return { hasHit: false, hitPosition: undefined }
    }
    const maxRange = this.currentWeapon.maxRange
    const from = this.position.clone().add(new Vector3D(0, this.eyeOffsetY, 0))
    const dir = this.applySpread(this.lookingDirection.clone().normalize(), this.currentSpread())
    const to = new Vector3D().addVectors(from, dir.clone().multiplyScalar(maxRange))

    const hitScanResult: HitscanResult = {
      hasHit: false,
      hitPosition: undefined,
      shotDirection: dir.clone(),
    }

    // Exact silhouette hit on robot meshes (head / torso / arms / legs triangles)
    const game = Game.getInstance()
    const botTargets = game.botRenderers.map((r, i) => ({
      botIndex: i,
      root: r.getRoot(),
      alive: game.trainingBots[i]?.isAlive ?? false,
    }))
    const meshHit = raycastBotMeshes(from, dir, botTargets, maxRange)

    // World Ammo ray for walls / props
    const fromAmmo = from.toAmmo()
    const toAmmo = to.toAmmo()
    const rayCallBack = new AmmoInstance!.ClosestRayResultCallback(fromAmmo, toAmmo)
    this.world.rayTest(fromAmmo, toAmmo, rayCallBack)

    let worldDist = Number.POSITIVE_INFINITY
    let worldPoint: Vector3D | undefined
    let worldNormal: Vector3D | undefined
    let worldBody: Ammo.btRigidBody | undefined

    if (rayCallBack.hasHit()) {
      worldPoint = Vector3D.fromAmmo(rayCallBack.get_m_hitPointWorld())
      worldNormal = Vector3D.fromAmmo(rayCallBack.get_m_hitNormalWorld())
      worldDist = from.distanceTo(worldPoint)
      worldBody = AmmoInstance!.btRigidBody.prototype.upcast(rayCallBack.get_m_collisionObject())
    }

    const meshDist = meshHit?.distance ?? Number.POSITIVE_INFINITY
    // Prefer bot hits slightly over world — Pool Day railings/frames often sit
    // a few cm in front of the visual silhouette and stole otherwise-clean shots.
    const botHitBias = 0.4

    if (meshHit && meshDist <= worldDist + botHitBias) {
      hitScanResult.hasHit = true
      hitScanResult.hitPosition = Vector3D.fromThree(meshHit.point)
      hitScanResult.hitNormal = Vector3D.fromThree(meshHit.normal)
      hitScanResult.hitBot = true
      hitScanResult.bodyPart = meshHit.part
      hitScanResult.botIndex = meshHit.botIndex
      const bot = game.trainingBots[meshHit.botIndex]
      const teammate = (game.isCoopTeams() && !!bot?.netPeerId) || (!!bot && game.isFriendlyToLocalPlayer(bot))
      if (teammate) {
        // Co-op: shots pass through humans rather than hurting them
        hitScanResult.hitBot = false
        hitScanResult.damageDealt = 0
      } else if (bot?.isNetworkPuppet) {
        const damage = damageAtRange(meshHit.part, this.currentWeapon.key, meshDist)
        hitScanResult.damageDealt = damage
        const headshot = meshHit.part === 'head'
        game.getMultiplayer()?.sendHitToTarget({
          targetPeerId: bot.netPeerId,
          botName: bot.netPeerId ? undefined : bot.name,
          damage,
          headshot,
          weapon: this.currentWeapon.key,
        })
      } else if (bot) {
        const result = bot.takeDamage(meshHit.part, this.currentWeapon.key, true, meshDist)
        hitScanResult.damageDealt = result.damage
        hitScanResult.killed = result.killed
        if (result.killed) {
          game.onPlayerKill(bot, this.currentWeapon.key, meshHit.part === 'head')
        }
      }
    } else if (worldPoint && worldBody) {
      hitScanResult.hasHit = true
      hitScanResult.hitPosition = worldPoint
      hitScanResult.hitNormal = worldNormal
      const delta = worldPoint.clone().sub(from).multiplyScalar(this.currentWeapon.impulseScale)
      const force = delta.toAmmo()
      worldBody.applyCentralImpulse(force)
      AmmoInstance!.destroy(force)
    }

    AmmoInstance!.destroy(fromAmmo)
    AmmoInstance!.destroy(toAmmo)
    AmmoInstance!.destroy(rayCallBack)

    if (this.currentWeapon.fireMode !== 'melee') {
      this.ammoInMag = Math.max(0, this.ammoInMag - 1)
      this.ammoByWeapon[this.currentWeapon.key] = this.ammoInMag
      game.stats.shotsFired++
      if (hitScanResult.hitBot) game.stats.shotsHit++
    }
    // After the shot is spent — refill to full mag if kill refill is on
    if (hitScanResult.killed && game.refillAmmoOnKill) {
      this.refillCurrentMag()
    }
    this.lastShootTimeStamp = new Date()
    this.recoilIdleMs = 0
    Game.getInstance().getMultiplayer()?.noteLocalShot()
    return hitScanResult
  }

  /** Instant full mag and topped-up reserve (used by refill-on-kill) */
  public refillCurrentMag(): void {
    if (this.currentWeapon.fireMode === 'melee') return
    const key = this.currentWeapon.key
    this.ammoInMag = this.currentWeapon.magazineSize
    this.ammoByWeapon[key] = this.ammoInMag
    this.reserveByWeapon[key] = getWeaponConfig(key).reserveAmmo
    this.isReloading = false
    this.reloadTimer = 0
  }

  /** Primary + USP (+ knife) — death respawn / match start after loadout pick */
  public equipSpawnLoadout(primary?: 'AK47' | 'AWP'): void {
    if (primary) this.primaryWeaponKey = primary
    const primaryKey = this.primaryWeaponKey
    this.currentWeapon = getWeaponConfig(primaryKey)
    this.rateOfFire = this.currentWeapon.rateOfFire
    this.reserveByWeapon = {
      AK47: primaryKey === 'AK47' ? getWeaponConfig('AK47').reserveAmmo : 0,
      Usp: getWeaponConfig('Usp').reserveAmmo,
      Knife: 0,
      AWP: primaryKey === 'AWP' ? getWeaponConfig('AWP').reserveAmmo : 0,
    }
    this.ammoByWeapon = {
      AK47: primaryKey === 'AK47' ? getWeaponConfig('AK47').magazineSize : 0,
      Usp: getWeaponConfig('Usp').magazineSize,
      Knife: 0,
      AWP: primaryKey === 'AWP' ? getWeaponConfig('AWP').magazineSize : 0,
    }
    this.ammoInMag = this.currentWeapon.magazineSize
    this.isReloading = false
    this.reloadTimer = 0
    this.recoilIndex = 0

    const game = Game.getInstance()
    const renderer = game.currentPlayer?.renderer
    if (renderer instanceof FPSRenderer) {
      renderer.equipWeaponMesh(primaryKey, false)
    } else if (renderer) {
      const mesh = game.globalLoadingManager.loadableMeshs.get(primaryKey)
      if (mesh) renderer.setMesh(mesh.clone() as FPSMesh, false)
    }
  }

  public canResetRecoil(): boolean {
    return this.recoilIdleMs > this.rateOfFire * 2
  }
  public canJump(): boolean {
    if (!this.isOnGround) return false
    if (this.jumpIgnoreGroundMs > 0) return false
    if (this.jumpRechargeTimer < this.jumpRechargeTime) return false
    if (!this.hasLeftGroundSinceJump) return false
    return true
  }

  public jump(): void {
    const vec3 = new AmmoInstance!.btVector3(0, this.jumpVelocity, 0)
    const linearVel = this.body.getLinearVelocity()
    if (linearVel.y() > 0) linearVel.setY(0)
    this.body.applyCentralImpulse(vec3)
    this.isOnGround = false
    this.hasGroundPlane = false
    this.hasLeftGroundSinceJump = false
    this.jumpIgnoreGroundMs = this.jumpIgnoreGroundDuration
    this.jumpRechargeTimer = 0
    this.landingGraceMs = 0
    // linearVel points at the body's own vector — destroying it would free live memory
    AmmoInstance!.destroy(vec3)

    const jumpYOffset = 0.11
    const previousY = this.getY()
    this.setY(previousY + jumpYOffset)
    this.position.y += jumpYOffset

    // Horizontal speed is deliberately untouched: that's what carries a bhop chain
    this.clampHorizontalSpeed(this.getSpeedLimit())
  }

  private clampHorizontalSpeed(maxSpeed: number): void {
    const hx = this.velocity.x
    const hz = this.velocity.z
    const mag = Math.sqrt(hx * hx + hz * hz)
    if (mag > maxSpeed && mag > 0.001) {
      const s = maxSpeed / mag
      this.velocity.x = hx * s
      this.velocity.z = hz * s
    }
    const lv = this.body.getLinearVelocity()
    lv.setX(this.velocity.x)
    lv.setZ(this.velocity.z)
  }

  public respawn(position?: Vector3D): void {
    const game = Game.getInstance()
    const pos = position ?? game.pickRespawnPosition(this.position, false, game.getLocalPlayerTeam())
    this.spawnPoint.copy(pos)
    this.setPosition(pos)
    this.position.copy(pos)
    this.setVelocity(Vector3D.ZERO())
    this.viewOffsetY = 0
    this.isOnGround = true
    this.hasLeftGroundSinceJump = true
    this.jumpIgnoreGroundMs = 0
    this.jumpRechargeTimer = this.jumpRechargeTime
    this.health = 100
    this.isDead = false
    this.isAlive = true
    this.deathTimer = 0
    this.deathAge = 0
    this.equipSpawnLoadout()
    game.renderer?.hud?.hideDeath()
  }

  /** Move player body to a spawn without full respawn logic */
  public teleportToSpawn(position: Vector3D): void {
    this.spawnPoint.copy(position)
    this.setPosition(position)
    this.position.copy(position)
    this.setVelocity(Vector3D.ZERO())
    this.viewOffsetY = 0
    this.isOnGround = true
    this.hasLeftGroundSinceJump = true
    this.jumpIgnoreGroundMs = 0
    this.jumpRechargeTimer = this.jumpRechargeTime
    this.health = 100
    this.armor = Player.SPAWN_ARMOR
    this.isDead = false
    this.isAlive = true
    this.deathTimer = 0
    this.deathAge = 0
  }

  public takeDamage(
    amount: number,
    _source = 'bot',
    opts?: { headshot?: boolean }
  ): { killed: boolean } {
    if (this.isDead) return { killed: false }
    let dmg = amount
    if (this.armor > 0) {
      const armorAbsorb = Math.min(this.armor, dmg * 0.5)
      this.armor -= armorAbsorb
      dmg -= armorAbsorb
      if (armorAbsorb > 0 && opts?.headshot) {
        void Game.getInstance().audioManager.playHelmetHit()
      }
    }
    this.health = Math.max(0, this.health - dmg)
    Game.getInstance().renderer?.hud?.flashDamage(dmg)

    if (this.health <= 0) {
      this.isDead = true
      this.isAlive = false
      this.deathTimer = this.deathRespawnDelay
      this.deathAge = 0
      this.setVelocity(Vector3D.ZERO())
      const game = Game.getInstance()
      game.onPlayerDeath()
      // Never play kill VO outside an active match (menu / loading used to void-fall here).
      if (game.matchStarted) {
        void game.audioManager.playPlayerDeath()
        if (game.shouldHoldRespawn()) {
          game.enterSpectator()
          game.renderer?.hud?.showDeathSpectate()
        } else {
          game.renderer?.hud?.showDeath(this.deathRespawnDelay)
        }
      }
      return { killed: true }
    }
    return { killed: false }
  }

  public updateDeath(dt: number): void {
    if (!this.isDead) return
    this.deathAge += dt
    // Round TDM holds bodies until the next freeze — spectator takes over
    if (Game.getInstance().shouldHoldRespawn()) return
    this.deathTimer = Math.max(0, this.deathTimer - dt)
    if (this.deathTimer <= 0) {
      this.respawn()
    }
  }

  // TODO: put this in the abstract super class
  private setPosition(pos: Vector3D): void {
    const posAmmo = pos.toAmmo()
    this.body.getWorldTransform().setOrigin(posAmmo)
    AmmoInstance!.destroy(posAmmo)
  }
  private setX(x: number): void {
    this.body.getWorldTransform().getOrigin().setX(x)
  }
  private setY(y: number): void {
    this.body.getWorldTransform().getOrigin().setY(y)
  }
  private setZ(z: number): void {
    this.body.getWorldTransform().getOrigin().setZ(z)
  }
  private getX(): number {
    return this.body.getWorldTransform().getOrigin().x()
  }
  private getY(): number {
    return this.body.getWorldTransform().getOrigin().y()
  }
  private getZ(): number {
    return this.body.getWorldTransform().getOrigin().z()
  }
  private multiplyVelocity(otherVel: Vector3D): void {
    const oldVel = this.body.getLinearVelocity()
    oldVel.setValue(oldVel.x() * otherVel.x, oldVel.y() * otherVel.y, oldVel.z() * otherVel.z)
  }
  private setVelocity(vel: Vector3D): void {
    this.body.getLinearVelocity().setValue(vel.x, vel.y, vel.z)
    this.velocity = vel
  }
}
