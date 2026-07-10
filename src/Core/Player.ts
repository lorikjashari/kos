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
import { FPSMesh } from '../View/Mesh/FPSMesh'

// Good reference : https://github.com/222464/EvolvedVirtualCreaturesRepo/blob/master/VirtualCreatures/Volumetric_SDL/Source/SceneObjects/Physics/DynamicCharacterController.cpp
export class Player extends Pawn implements IUpdatable {
  public velocity: Vector3D = new Vector3D(0, 0, 0)
  public lookingDirection: Vector3D = Vector3D.ZERO()
  public lastShootTimeStamp = new Date()
  private jumpRechargeTime = 100
  private jumpRechargeTimer = 0
  public deceleration = new Vector3D(0.95, 1, 0.95)
  public airDeceleration = new Vector3D(0.98, 1, 0.98)

  private moveDirection: Vector3D = Vector3D.ZERO()
  public speed = 100
  private maxSpeed = 100
  public rateOfFire = 100
  public currentWeapon: WeaponConfig = getWeaponConfig('AK47')
  public ammoInMag = 30
  public isReloading = false
  private reloadTimer = 0
  /** Mag ammo remembered per weapon when switching (KoS) */
  private ammoByWeapon: Record<string, number> = {
    AK47: 30,
    Usp: 12,
    Knife: 0,
  }
  public health = 100
  public armor = 0
  public money = 800
  public isWalking = false
  public isCrouching = false
  public recoilIndex = 0
  public wishSpeedScale = 1
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
  public eyeOffsetY = (this.capsuleDimension.y * 2.5) / 3
  constructor(position: Vector3D) {
    super(position, Vector3D.ZERO())
    this.spawnPoint = position.clone()
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
    // Do 4 and only update it once jump is pressed
    return {
      initialLocalPos: new Vector3D(0, -this.capsuleDimension.y / 2, 0),
      size: 1.5,
    }
  }
  addToWorld(physics: Physics) {
    this.world = physics.world
    physics.add(this.body)
  }
  prestep(dt: number) {
    this.moveDirection = Vector3D.ZERO()
  }
  private raycastToGround(): void {
    let { initialLocalPos, size } = this.getGroundRaycastProperties()

    const from: Ammo.btVector3 = this.position
      .clone()
      .add(new Vector3D(initialLocalPos.x, initialLocalPos.y, initialLocalPos.z))
      .toAmmo()
    const to: Ammo.btVector3 = this.position
      .clone()
      .add(new Vector3D(initialLocalPos.x, initialLocalPos.y - size, initialLocalPos.z))
      .toAmmo()

    const rayCallBack = new AmmoInstance!.ClosestRayResultCallback(from, to)
    this.world.rayTest(from, to, rayCallBack)
    if (!this.isOnGround && rayCallBack.hasHit()) this.velocityPreserveAcc = 0
    this.isOnGround = rayCallBack.hasHit()
    AmmoInstance!.destroy(from)
    AmmoInstance!.destroy(to)
    AmmoInstance!.destroy(rayCallBack)
  }
  private updateJumpRechargeTime(dt: number): void {
    if (this.jumpRechargeTimer < this.jumpRechargeTime) {
      this.jumpRechargeTimer += dt * 1000
    }
  }

  private Accelerate(
    accelDir: Vector3D,
    prevVelocity: Vector3D,
    wishSpeed: number,
    airAccel: number,
    dt: number
  ): Vector3D {
    let wishSpd = wishSpeed
    const currentSpeed = prevVelocity.dot(accelDir)
    const addSpeed = wishSpd - currentSpeed
    if (addSpeed <= 0) {
      return prevVelocity
    }

    let accelSpeed = wishSpeed * airAccel * dt
    if (accelSpeed > addSpeed) {
      accelSpeed = addSpeed
    }
    const vel = prevVelocity.clone()
    vel.x += accelSpeed * accelDir.x
    vel.y += accelSpeed * accelDir.y
    vel.z += accelSpeed * accelDir.z
    return vel
  }

  private getWishSpeed(): number {
    return 10 * this.wishSpeedScale
  }

  private MoveGround(accelDir: Vector3D, prevVelocity: Vector3D, dt: number): Vector3D {
    const friction = 1
    const speed = Math.pow(prevVelocity.x, 2) + Math.pow(prevVelocity.z, 2)
    if (speed != 0) {
      const drop = speed * friction * dt
      prevVelocity.multiplyScalar((this.deceleration.x * Math.max(speed - drop, 0)) / speed)
    }
    return this.Accelerate(accelDir, prevVelocity, this.getWishSpeed(), 200, dt)
  }

  private Decelerate(prevVelocity: Vector3D, dt: number, deceleration: number) {
    const friction = 1
    const speed = Math.pow(prevVelocity.x, 2) + Math.pow(prevVelocity.z, 2)
    if (speed != 0) {
      const drop = speed * friction * dt
      prevVelocity.multiplyScalar((this.deceleration.x * Math.max(speed - drop, 0)) / speed)
    }
  }
  private velocityPreserveAcc = 0
  private velocityPreserveDelay = 100
  public currentSpeedMagnitude = 0
  update(dt: number): void {
    super.update(dt, true, false) // Only update the position
    const linearVelocity: Ammo.btVector3 = this.body.getLinearVelocity()

    let colWithAnything = false
    this.raycastToGround()

    const resultCallback = new AmmoInstance!.ConcreteContactResultCallback()
    resultCallback.addSingleResult = function (
      manifoldPoint,
      collisionObjectA,
      id0,
      index0,
      collisionObjectB,
      id1,
      index1
    ) {
      colWithAnything = true
      /*             var manifold = (Ammo as any).wrapPointer(manifoldPoint.ptr, Ammo.btManifoldPoint);
                        var localPointA = manifold.get_m_localPointA();
                        var localPointB = manifold.get_m_localPointB(); */
      return 0
    }

    this.world.contactTest(this.body, resultCallback)
    AmmoInstance!.destroy(resultCallback)
    const y = linearVelocity.y()
    this.currentSpeedMagnitude = Math.pow(linearVelocity.x(), 2) + Math.pow(linearVelocity.z(), 2)

    if (colWithAnything && this.velocityPreserveAcc > this.velocityPreserveDelay) {
      this.velocity = this.MoveGround(this.moveDirection, this.velocity, dt)
    } else {
      this.velocity = this.Accelerate(this.moveDirection, this.velocity, this.getWishSpeed() / 2, 200 / 2, dt)
      this.velocityPreserveAcc += dt * 1000
    }

    linearVelocity.setValue(this.velocity.x, y, this.velocity.z)
    this.velocity.y = y
    this.updateJumpRechargeTime(dt)
    this.updateReload(dt)
    this.addHalfGravity(dt)
  }

  private updateReload(dt: number): void {
    if (!this.isReloading) return
    this.reloadTimer -= dt
    if (this.reloadTimer <= 0) {
      this.isReloading = false
      this.ammoInMag = this.currentWeapon.magazineSize
      this.ammoByWeapon[this.currentWeapon.key] = this.ammoInMag
      this.reloadTimer = 0
    }
  }

  public setWalking(walking: boolean): void {
    this.isWalking = walking
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
    else if (this.isWalking) this.wishSpeedScale = 0.48
    else this.wishSpeedScale = 1
  }

  public startReload(): boolean {
    if (this.isReloading) return false
    if (this.currentWeapon.fireMode === 'melee') return false
    if (this.ammoInMag >= this.currentWeapon.magazineSize) return false
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
  private addHalfGravity(dt: number) {
    const velY = this.body.getLinearVelocity().y()
    this.body.getLinearVelocity().setY(velY - 9.81 * 0.5 * dt)
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

  public shoot(): HitscanResult {
    if (this.isDead) {
      return { hasHit: false, hitPosition: undefined }
    }
    const { from, to } = this.createHitscanPoints(this.currentWeapon.maxRange)
    const dir = this.lookingDirection.clone().normalize()
    const maxRange = this.currentWeapon.maxRange

    const hitScanResult: HitscanResult = {
      hasHit: false,
      hitPosition: undefined,
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

    if (meshHit && meshDist <= worldDist) {
      hitScanResult.hasHit = true
      hitScanResult.hitPosition = Vector3D.fromThree(meshHit.point)
      hitScanResult.hitNormal = Vector3D.fromThree(meshHit.normal)
      hitScanResult.hitBot = true
      hitScanResult.bodyPart = meshHit.part
      hitScanResult.botIndex = meshHit.botIndex
      const bot = game.trainingBots[meshHit.botIndex]
      if (bot) {
        const result = bot.takeDamage(meshHit.part, this.currentWeapon.key, true)
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
    }
    // After the shot is spent — refill to full mag if kill refill is on
    if (hitScanResult.killed && game.refillAmmoOnKill) {
      this.refillCurrentMag()
    }
    this.lastShootTimeStamp = new Date()
    return hitScanResult
  }

  /** Instant full mag (used by refill-on-kill) */
  public refillCurrentMag(): void {
    if (this.currentWeapon.fireMode === 'melee') return
    this.ammoInMag = this.currentWeapon.magazineSize
    this.ammoByWeapon[this.currentWeapon.key] = this.ammoInMag
    this.isReloading = false
    this.reloadTimer = 0
  }

  /** Always AR + full mags (death respawn / match start) */
  public equipSpawnLoadout(): void {
    this.currentWeapon = getWeaponConfig('AK47')
    this.rateOfFire = this.currentWeapon.rateOfFire
    this.ammoByWeapon = {
      AK47: getWeaponConfig('AK47').magazineSize,
      Usp: getWeaponConfig('Usp').magazineSize,
      Knife: 0,
    }
    this.ammoInMag = this.currentWeapon.magazineSize
    this.isReloading = false
    this.reloadTimer = 0
    this.recoilIndex = 0

    const game = Game.getInstance()
    const ak = game.globalLoadingManager.loadableMeshs.get('AK47')
    const renderer = game.currentPlayer?.renderer
    if (ak && renderer) {
      renderer.setMesh(ak.clone() as FPSMesh)
    }
  }

  public canResetRecoil(): boolean {
    // TODO: do it with deltaTime.
    return new Date().getTime() - this.lastShootTimeStamp.getTime() > this.rateOfFire * 2
  }
  public canJump(): boolean {
    return this.isOnGround && this.jumpRechargeTimer >= this.jumpRechargeTime
  }

  public jump(): void {
    const vec3 = new AmmoInstance!.btVector3(0, this.jumpVelocity, 0)
    const linearVel = this.body.getLinearVelocity()
    linearVel.setY(0)
    this.body.applyCentralImpulse(vec3)
    this.isOnGround = false
    this.jumpRechargeTimer = 0
    AmmoInstance!.destroy(vec3)
    AmmoInstance!.destroy(linearVel)

    const jumpYOffset = 0.11
    const previousY = this.getY()
    this.setY(previousY + jumpYOffset)
  }

  public respawn(position?: Vector3D): void {
    const game = Game.getInstance()
    const pos = position ?? game.pickRespawnPosition(this.position)
    this.spawnPoint.copy(pos)
    this.setPosition(pos)
    this.setVelocity(Vector3D.ZERO())
    this.isOnGround = true
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
    this.setVelocity(Vector3D.ZERO())
    this.isOnGround = true
    this.health = 100
    this.isDead = false
    this.isAlive = true
    this.deathTimer = 0
    this.deathAge = 0
  }

  public takeDamage(amount: number, _source = 'bot'): { killed: boolean } {
    if (this.isDead) return { killed: false }
    let dmg = amount
    if (this.armor > 0) {
      const armorAbsorb = Math.min(this.armor, dmg * 0.5)
      this.armor -= armorAbsorb
      dmg -= armorAbsorb
    }
    this.health = Math.max(0, this.health - dmg)
    Game.getInstance().renderer?.hud?.flashDamage(dmg)

    if (this.health <= 0) {
      this.isDead = true
      this.isAlive = false
      this.deathTimer = this.deathRespawnDelay
      this.deathAge = 0
      this.setVelocity(Vector3D.ZERO())
      Game.getInstance().onPlayerDeath()
      void Game.getInstance().audioManager.playPlayerDeath()
      Game.getInstance().renderer?.hud?.showDeath(this.deathRespawnDelay)
      return { killed: true }
    }
    return { killed: false }
  }

  public updateDeath(dt: number): void {
    if (!this.isDead) return
    this.deathAge += dt
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
