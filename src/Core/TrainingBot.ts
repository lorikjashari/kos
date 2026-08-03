import { Vector3D } from './Vector'
import { Physics } from '../Physics/Physics'
import { BodyPart, damageAtRange, damageForBodyPart } from './BodyPart'
import { IUpdatable } from '../Interface/IUpdatable'
import { Game } from '../Game'
import type { Player } from './Player'
import type { Team } from './Teams'

/** World Y at or below this → fall through map / void death */
const VOID_DEATH_Y = -30

export type BotDifficulty = 'easy' | 'medium' | 'hard'

interface DifficultyTuning {
  moveSpeed: number
  fireInterval: number
  aimSpread: number
  damage: number
  engageRange: number
  reactionTime: number
  strafeChance: number
}

const TUNING: Record<BotDifficulty, DifficultyTuning> = {
  // Slow to notice you, loose aim, softer spray
  easy: {
    moveSpeed: 5.6,
    fireInterval: 0.72,
    aimSpread: 0.14,
    damage: 10,
    engageRange: 48,
    reactionTime: 0.95,
    strafeChance: 0.22,
  },
  // Playable — notices you, but not instant laser
  medium: {
    moveSpeed: 7.2,
    fireInterval: 0.38,
    aimSpread: 0.07,
    damage: 16,
    engageRange: 65,
    reactionTime: 0.48,
    strafeChance: 0.42,
  },
  // Former default aggression — snaps and dumps hard
  hard: {
    moveSpeed: 9.6,
    fireInterval: 0.15,
    aimSpread: 0.02,
    damage: 28,
    engageRange: 90,
    reactionTime: 0.08,
    strafeChance: 0.7,
  },
}

/**
 * Combat training bot — walks around walls toward the player, shoots on LOS.
 */
export class TrainingBot implements IUpdatable {
  public position: Vector3D
  public yaw: number
  public health = 100
  public isAlive = true
  public readonly spawnPosition: Vector3D
  public difficulty: BotDifficulty
  public name = 'BOT'
  /** Set only in team deathmatch; null means free-for-all */
  public team: Team | null = null
  public isMoving = false
  public weaponKey = 'AK47'
  public lastShotDir = new Vector3D(0, 0, -1)
  public eyeHeight = 1.55
  /** Seconds left of visible muzzle / aim kick (set on fire) */
  public shootFlash = 0
  /** Damage dealt by the local player this life (for assists) */
  public playerDamageDealt = 0
  public kills = 0
  public deaths = 0
  public assists = 0
  /** Who damaged this bot this life (for assist credit) */
  public damagers = new Set<string>()

  public deathAge = 0
  public readonly deathDuration = 4.0
  public readonly fallDuration = 0.75
  /** Driven by multiplayer snapshots — no local AI */
  public isCrouching = false
  public isNetworkPuppet = false
  public netKey = ''
  public netPeerId: string | undefined
  public netTX = 0
  public netTY = 0
  public netTZ = 0
  public netTYaw = 0
  public hasNetTarget = false
  public readonly fadeStart = 2.8
  public readonly fadeDuration = 0.7

  public static showHitboxes = false

  private fireCooldown = 0
  private seeTimer = 0
  private strafeSign = 1
  private strafeTimer = 0
  private patrolAngle = 0
  private readonly homeRadius = 42
  private waypoint?: Vector3D
  private stuckTimer = 0
  private lastPos = new Vector3D()
  private wallFollowDir = 1
  private readonly probeDist = 2.4
  private readonly stepProbe = 0.95
  private repathTimer = 0
  private huntBias = Math.random() < 0.6 ? 'player' : 'any'
  /** Vertical velocity while airborne (bot feet are kinematic — no rigid body) */
  private velocityY = 0
  private isOnGround = true
  private readonly gravity = 28
  /** Max curb / stair rise bots can climb (matches player tryStepUp) */
  private readonly maxStepUp = 2.0
  /** How far below feet still counts as grounded for ramp/stair follow */
  private readonly groundSnapDown = 0.85
  private readonly groundSkin = 0.04
  private readonly minWalkableNy = 0.55
  /** First frame after a spawn gets a taller ground probe so it can settle */
  private needsGroundSettle = true
  /** Editor mannequin — no move / shoot AI */
  public aiFrozen = false
  /** When true (editor), yaw tracks the local player each frame */
  public lookAtPlayer = false
  /** Uniform visual scale (editor) */
  public visualScale = 1
  /** Optional visual key in GlobalLoadingManager (e.g. CsTerrorist) */
  public visualModel?: string
  /** Home pose for editor Reset */
  public editorHome?: { x: number; y: number; z: number; yaw: number; scale: number }

  private lastKnownTarget?: Vector3D
  private retargetTimer = 0
  private lockedTargetName?: string
  /** Shots fired in the current sustained burst (recoil / spray bloom) */
  private burstCount = 0
  /** Target eye position last frame — used to gauge how fast it's moving */
  private prevTargetEye?: Vector3D

  constructor(position: Vector3D, yaw = 0, difficulty: BotDifficulty = 'medium', name = 'BOT') {
    this.position = position.clone()
    this.spawnPosition = position.clone()
    this.yaw = yaw
    this.difficulty = difficulty
    this.name = name
    this.patrolAngle = Math.random() * Math.PI * 2
    this.strafeSign = Math.random() < 0.5 ? -1 : 1
    this.wallFollowDir = Math.random() < 0.5 ? -1 : 1
    this.fireCooldown = 0.4 + Math.random() * 0.6
    this.lastPos.copy(position)
  }

  public addToWorld(_physics: Physics): void {
    /* mesh hits */
  }

  public takeDamage(
    part: BodyPart,
    weaponKey: string,
    fromPlayer = false,
    distance?: number
  ): { damage: number; killed: boolean; wasAlive: boolean } {
    const wasAlive = this.isAlive
    if (!this.isAlive) {
      return { damage: 0, killed: false, wasAlive: false }
    }

    const damage =
      distance === undefined ? damageForBodyPart(part, weaponKey) : damageAtRange(part, weaponKey, distance)
    this.health = Math.max(0, this.health - damage)
    if (fromPlayer) {
      this.playerDamageDealt += damage
      const pname = Game.getInstance().playerName || 'Player'
      this.damagers.add(pname)
    }
    if (this.health <= 0) {
      this.isAlive = false
      this.deathAge = 0
      this.isMoving = false
      this.waypoint = undefined
      this.deaths++
    }
    return { damage, killed: !this.isAlive, wasAlive }
  }

  /** Flat damage from another bot (FF / finish) */
  public takeBotDamage(
    amount: number,
    attackerName?: string
  ): { damage: number; killed: boolean; wasAlive: boolean } {
    const wasAlive = this.isAlive
    if (!this.isAlive) return { damage: 0, killed: false, wasAlive: false }
    const damage = Math.max(1, Math.round(amount))
    this.health = Math.max(0, this.health - damage)
    if (attackerName) this.damagers.add(attackerName)
    if (this.health <= 0) {
      this.isAlive = false
      this.deathAge = 0
      this.isMoving = false
      this.waypoint = undefined
      this.deaths++
    }
    return { damage, killed: !this.isAlive, wasAlive }
  }

  public respawn(): void {
    const game = Game.getInstance()
    // Frozen editor bots always return to their fixed spot
    const pos = this.aiFrozen
      ? this.spawnPosition.clone()
      : game.pickRespawnPosition(this.position, true, this.team)
    this.health = 100
    this.isAlive = true
    this.deathAge = 0
    this.playerDamageDealt = 0
    this.damagers.clear()
    this.spawnPosition.copy(pos)
    this.position.copy(pos)
    this.lastPos.copy(pos)
    this.velocityY = 0
    this.isOnGround = true
    this.needsGroundSettle = true
    if (!this.aiFrozen) {
      this.yaw = Math.random() * Math.PI * 2
    }
    this.fireCooldown = 0.5 + Math.random()
    this.seeTimer = 0
    this.isMoving = false
    this.waypoint = undefined
    this.stuckTimer = 0
    this.lastKnownTarget = undefined
    this.lockedTargetName = undefined
    this.retargetTimer = 0
    this.burstCount = 0
    this.prevTargetEye = undefined
  }

  public update(dt: number): void {
    if (this.isNetworkPuppet) {
      if (this.hasNetTarget) {
        const k = Math.min(1, dt * 14)
        this.position.x += (this.netTX - this.position.x) * k
        this.position.y += (this.netTY - this.position.y) * k
        this.position.z += (this.netTZ - this.position.z) * k
        let dy = this.netTYaw - this.yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        this.yaw += dy * k
      }
      if (!this.isAlive) {
        this.deathAge += dt
      } else if (this.shootFlash > 0) {
        this.shootFlash = Math.max(0, this.shootFlash - dt)
      }
      return
    }

    if (!this.isAlive) {
      this.deathAge += dt
      if (this.deathAge >= this.deathDuration) {
        this.respawn()
      }
      return
    }

    if (this.checkVoidDeath()) return

    // Editor dummy — stay planted; optional face-player; no move / shoot
    if (this.aiFrozen) {
      this.isMoving = false
      if (this.lookAtPlayer) {
        const game = Game.getInstance()
        const player = game.currentPlayer?.player
        if (player && !player.isDead) {
          this.faceToward(player.position)
        }
      }
      if (this.shootFlash > 0) this.shootFlash = Math.max(0, this.shootFlash - dt)
      return
    }

    const game = Game.getInstance()
    const player = game.currentPlayer?.player
    const physics = game.getPhysics()
    if (!player) {
      this.isMoving = false
      this.idlePatrol(dt, physics)
      this.followTerrain(physics, dt)
      this.checkVoidDeath()
      return
    }

    // Keep fighting even if the player is dead (bot free-for-all)
    this.combatThink(dt, player, physics)
    this.followTerrain(physics, dt)
    this.checkVoidDeath()
    if (this.shootFlash > 0) this.shootFlash = Math.max(0, this.shootFlash - dt)
  }

  /** Fell through the map — die and respawn on a real spawn after the death timer. */
  private checkVoidDeath(): boolean {
    if (!this.isAlive || this.aiFrozen || this.isNetworkPuppet) return false
    if (this.position.y > VOID_DEATH_Y) return false
    this.health = 0
    this.isAlive = false
    this.deathAge = 0
    this.isMoving = false
    this.waypoint = undefined
    this.velocityY = 0
    this.deaths++
    return true
  }

  private idlePatrol(dt: number, physics: Physics): void {
    const tune = TUNING[this.difficulty]
    this.patrolAngle += dt * 0.85
    // Roam farther so they cover the map instead of circling spawn
    const r = this.homeRadius * (0.45 + 0.35 * Math.abs(Math.sin(this.patrolAngle * 0.37)))
    const target = new Vector3D(
      this.spawnPosition.x + Math.cos(this.patrolAngle) * r,
      this.position.y,
      this.spawnPosition.z + Math.sin(this.patrolAngle) * r
    )
    this.navigateToward(target, tune.moveSpeed * 0.7, dt, physics)
  }

  private combatThink(dt: number, player: Player, physics: Physics): void {
    const tune = TUNING[this.difficulty]
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    this.strafeTimer -= dt
    this.repathTimer -= dt
    this.retargetTimer -= dt

    const game = Game.getInstance()
    const myEye = this.position.clone().add(new Vector3D(0, this.eyeHeight, 0))

    // Stick to a target briefly so they commit to a chase instead of twitching
    let threat = this.pickCombatTarget(game, player)
    if (this.retargetTimer > 0 && this.lockedTargetName) {
      const locked = this.resolveLockedTarget(game, player)
      if (locked) threat = locked
      else this.retargetTimer = 0
    } else if (threat) {
      this.lockedTargetName = threat.kind === 'bot' && threat.bot ? threat.bot.name : '__player__'
      this.retargetTimer = 1.4 + Math.random() * 1.2
    }

    if (!threat) {
      this.seeTimer = 0
      // Hunt last known position, then roam the map
      if (this.lastKnownTarget) {
        const d = this.flatDist(this.position, this.lastKnownTarget)
        if (d > 1.2) {
          this.navigateToward(this.lastKnownTarget, tune.moveSpeed * 1.15, dt, physics)
          this.faceToward(this.lastKnownTarget)
          return
        }
        this.lastKnownTarget = undefined
      }
      this.idlePatrol(dt, physics)
      return
    }

    const aimAtBot = threat.kind === 'bot'
    const targetPos = threat.eye
    const moveGoalBase = threat.pos
    this.lastKnownTarget = moveGoalBase.clone()

    const toTarget = targetPos.clone().sub(myEye)
    const dist = toTarget.length()

    // How fast the target is moving (units/sec) — strafers are harder to hit
    let targetSpeed = 0
    if (this.prevTargetEye) {
      targetSpeed = Math.min(20, this.prevTargetEye.distanceTo(targetPos) / Math.max(dt, 1e-3))
    }
    this.prevTargetEye = targetPos.clone()

    // Chase across the whole map; shoot when LOS opens
    const hasLos = dist < tune.engageRange && this.hasLineOfSight(physics, myEye, targetPos)
    if (hasLos) this.seeTimer += dt
    else {
      this.seeTimer = Math.max(0, this.seeTimer - dt * 2)
      this.burstCount = 0
    }

    this.faceToward(targetPos)

    const ideal = 8
    let goal = moveGoalBase.clone()

    if (hasLos && dist < 3.2) {
      // Stick and dump — tiny circle so they don't freeze
      const forward = toTarget.clone().setY(0)
      if (forward.lengthSq() > 0.01) {
        forward.normalize()
        const side = new Vector3D(-forward.z, 0, forward.x).multiplyScalar(this.strafeSign * 1.4)
        goal = this.position.clone().add(side)
      } else {
        goal = this.position.clone()
      }
    } else if (hasLos && dist > ideal - 2 && dist < ideal + 4) {
      if (this.strafeTimer <= 0) {
        this.strafeSign *= Math.random() < tune.strafeChance ? -1 : 1
        this.strafeTimer = 0.28 + Math.random() * 0.45
      }
      const forward = toTarget.clone().setY(0).normalize()
      const side = new Vector3D(-forward.z, 0, forward.x).multiplyScalar(this.strafeSign * 3.2)
      goal = this.position.clone().add(side).add(forward.multiplyScalar(2.0))
    } else {
      // Sprint to them — predict slightly toward their position
      goal = moveGoalBase.clone()
    }

    // Faster when hunting / no LOS; still quick in gunfights
    const chaseSpeed =
      !hasLos || dist > 22 ? tune.moveSpeed * 1.35 : dist > 12 ? tune.moveSpeed * 1.15 : tune.moveSpeed
    this.navigateToward(goal, chaseSpeed, dt, physics)

    if (hasLos && dist < tune.engageRange) {
      // Hard still snaps up close; Easy/Medium keep a real delay so peeks aren't instant death
      let react = tune.reactionTime
      if (this.difficulty === 'hard' && dist < 6) react *= 0.25
      else if (this.difficulty === 'medium' && dist < 5) react *= 0.7
      else if (this.difficulty === 'easy' && dist < 4) react *= 0.85
      if (this.seeTimer >= react && this.fireCooldown <= 0) {
        if (aimAtBot && threat.bot) {
          this.tryShootBot(threat.bot, myEye, targetPos, tune, physics, dist, targetSpeed)
        } else if (!player.isDead) {
          this.tryShoot(player, myEye, targetPos, tune, physics, dist, targetSpeed)
        }
      }
    }
  }

  private resolveLockedTarget(
    game: Game,
    player: Player
  ): { kind: 'bot' | 'player'; eye: Vector3D; pos: Vector3D; bot?: TrainingBot } | undefined {
    if (this.lockedTargetName === '__player__' && !player.isDead && !game.isFriendlyToLocalPlayer(this)) {
      return {
        kind: 'player',
        eye: player.position.clone().add(new Vector3D(0, player.eyeOffsetY, 0)),
        pos: player.position.clone(),
      }
    }
    for (const other of game.trainingBots) {
      if (other === this || !other.isAlive) continue
      if (game.areBotsFriendly(this, other)) continue
      if (other.name === this.lockedTargetName) {
        return {
          kind: 'bot',
          eye: other.position.clone().add(new Vector3D(0, other.eyeHeight, 0)),
          pos: other.position.clone(),
          bot: other,
        }
      }
    }
    return undefined
  }

  /** Nearest alive enemy — hunt player hard, also fight other bots */
  private pickCombatTarget(
    game: Game,
    player: Player
  ): { kind: 'bot' | 'player'; eye: Vector3D; pos: Vector3D; bot?: TrainingBot } | undefined {
    type Cand = { kind: 'bot' | 'player'; eye: Vector3D; pos: Vector3D; bot?: TrainingBot; dist: number; score: number }
    const cands: Cand[] = []
    const physics = game.getPhysics()
    const myEye = this.position.clone().add(new Vector3D(0, this.eyeHeight, 0))

    const coop = game.isCoopTeams()
    for (const other of game.trainingBots) {
      if (other === this || !other.isAlive) continue
      // In co-op the AI is one side and every human the other, so bots stop
      // fighting each other and remote players become valid targets
      if (coop && !other.isNetworkPuppet) continue
      if (game.areBotsFriendly(this, other)) continue
      const d = this.flatDist(this.position, other.position)
      const eye = other.position.clone().add(new Vector3D(0, other.eyeHeight, 0))
      let score = d
      if (other.playerDamageDealt >= 20) score -= 10
      if (other.health < 50) score -= 6
      if (this.huntBias === 'any') score -= 3
      if (coop) score -= 12
      // Prefer visible fights so they actually clash
      if (d < 55 && this.hasLineOfSight(physics, myEye, eye)) score -= 14
      cands.push({
        kind: 'bot',
        eye,
        pos: other.position.clone(),
        bot: other,
        dist: d,
        score,
      })
    }

    if (!player.isDead && !game.isFriendlyToLocalPlayer(this)) {
      const d = this.flatDist(this.position, player.position)
      const eye = player.position.clone().add(new Vector3D(0, player.eyeOffsetY, 0))
      const playerBias = this.huntBias === 'player' ? 18 : 9
      let score = d - playerBias
      if (d < 60 && this.hasLineOfSight(physics, myEye, eye)) score -= 16
      cands.push({
        kind: 'player',
        eye,
        pos: player.position.clone(),
        dist: d,
        score,
      })
    }

    if (cands.length === 0) return undefined
    cands.sort((a, b) => a.score - b.score)
    const best = cands[0]
    return { kind: best.kind, eye: best.eye, pos: best.pos, bot: best.bot }
  }

  /**
   * Wall-aware step: never walk through geometry.
   * If direct path blocked, pick the free side / detour that gets closer to the goal.
   */
  private navigateToward(goal: Vector3D, speed: number, dt: number, physics: Physics): void {
    if (this.waypoint && this.flatDist(this.position, this.waypoint) < 0.55) {
      this.waypoint = undefined
    }

    // Periodically repath when stuck or blocked so they don't orbit walls
    if (this.repathTimer <= 0 && this.waypoint && !this.canWalkToward(physics, this.waypoint)) {
      this.waypoint = undefined
      this.repathTimer = 0.25
    }

    let target = this.waypoint ?? goal

    if (!this.canWalkToward(physics, target)) {
      const detour = this.findDetour(physics, goal)
      if (detour) {
        this.waypoint = detour
        target = detour
        this.repathTimer = 0.4
      } else if (!this.canWalkToward(physics, goal)) {
        this.wallFollowSideStep(physics, goal, speed, dt)
        return
      } else {
        target = goal
        this.waypoint = undefined
      }
    } else if (!this.waypoint && this.canWalkToward(physics, goal)) {
      target = goal
    }

    this.stepWithCollision(physics, target, speed, dt)
  }

  private wallFollowSideStep(physics: Physics, goal: Vector3D, speed: number, dt: number): void {
    const toGoal = goal.clone().sub(this.position).setY(0)
    if (toGoal.lengthSq() < 0.001) {
      this.isMoving = false
      return
    }
    toGoal.normalize()
    const side = new Vector3D(-toGoal.z * this.wallFollowDir, 0, toGoal.x * this.wallFollowDir)
    const tryDirs = [
      side.clone().add(toGoal).normalize(),
      side.clone().add(toGoal.clone().multiplyScalar(0.5)).normalize(),
      side,
      side.clone().multiplyScalar(-1).add(toGoal).normalize(),
      side.clone().multiplyScalar(-1),
      toGoal.clone().multiplyScalar(-1),
    ]
    for (const dir of tryDirs) {
      if (this.isDirClear(physics, dir, this.probeDist)) {
        this.stepAlong(dir, speed * 1.05, dt)
        this.faceDir(dir)
        return
      }
    }
    this.wallFollowDir *= -1
    this.isMoving = false
  }

  private findDetour(physics: Physics, goal: Vector3D): Vector3D | undefined {
    const toGoal = goal.clone().sub(this.position).setY(0)
    const dist = toGoal.length()
    if (dist < 0.2) return undefined
    toGoal.normalize()

    const baseAngles = [
      0.2, -0.2, 0.4, -0.4, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, Math.PI * 0.5, -Math.PI * 0.5, 1.9, -1.9, 2.4, -2.4,
    ]
    const stepLens = [2.8, 4.0, 5.5, 7.0]
    let best: Vector3D | undefined
    let bestScore = Number.POSITIVE_INFINITY

    for (const a of baseAngles) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      const dir = new Vector3D(toGoal.x * c - toGoal.z * s, 0, toGoal.x * s + toGoal.z * c)
      if (!this.isDirClear(physics, dir, this.probeDist)) continue

      for (const stepLen of stepLens) {
        if (!this.isDirClear(physics, dir, Math.min(stepLen, this.probeDist * 1.6))) continue
        const step = this.position.clone().add(dir.clone().multiplyScalar(stepLen))
        const remain = this.flatDist(step, goal)
        const openBonus = this.canWalkToward(physics, goal, step) ? -10 : 0
        const score = remain + Math.abs(a) * 0.4 + openBonus
        if (score < bestScore) {
          bestScore = score
          best = step
        }
      }
    }

    if (best) this.wallFollowDir = Math.random() < 0.5 ? -1 : 1
    return best
  }

  private stepWithCollision(physics: Physics, target: Vector3D, speed: number, dt: number): void {
    const delta = target.clone().sub(this.position)
    delta.y = 0
    const len = delta.length()
    if (len < 0.12) {
      this.isMoving = false
      return
    }
    const dir = delta.clone().normalize()
    this.faceDir(dir)

    if (!this.isDirClear(physics, dir, this.stepProbe)) {
      // Slide along wall: try slight left/right of current dir
      for (const a of [0.55, -0.55, 1.0, -1.0]) {
        const c = Math.cos(a)
        const s = Math.sin(a)
        const slide = new Vector3D(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c)
        if (this.isDirClear(physics, slide, this.stepProbe)) {
          this.stepAlong(slide, speed, dt)
          return
        }
      }
      this.isMoving = false
      this.stuckTimer += dt
      if (this.stuckTimer > 0.6) {
        this.waypoint = undefined
        this.wallFollowDir *= -1
        this.stuckTimer = 0
      }
      return
    }

    this.stuckTimer = 0
    this.stepAlong(dir, speed, dt)
  }

  private stepAlong(dir: Vector3D, speed: number, dt: number): void {
    const physics = Game.getInstance().getPhysics()
    const step = Math.min(speed * dt, this.stepProbe * 0.9)
    this.tryStepUp(physics, dir)
    this.position.x += dir.x * step
    this.position.z += dir.z * step
    this.isMoving = true
  }

  private canWalkToward(physics: Physics, target: Vector3D, from = this.position): boolean {
    const delta = target.clone().sub(from)
    delta.y = 0
    const len = delta.length()
    if (len < 0.1) return true
    return this.isDirClear(physics, delta.normalize(), Math.min(len, this.probeDist), from)
  }

  private isDirClear(physics: Physics, dir: Vector3D, distance: number, from = this.position): boolean {
    const origin = from.clone().add(new Vector3D(0, 1.05, 0))
    const flat = dir.clone().setY(0)
    if (flat.lengthSq() < 1e-8) return true
    flat.normalize()
    const end = origin.clone().add(flat.clone().multiplyScalar(distance))
    const hit = physics.raycast(origin, end)
    if (!hit.hasHit || !hit.hitPosition) return true
    if (hit.hitPosition.distanceTo(origin) > distance - 0.08) return true
    // Walkable slope ahead — not a blocking wall
    if (hit.hitNormal && Math.abs(hit.hitNormal.y) >= this.minWalkableNy) return true
    // Stair / curb we can climb
    if (this.canStepAt(physics, from, flat, Math.min(distance, 1.35))) return true
    return false
  }

  /**
   * Nearest surface straight down. Steep hits are still reported — a bot that
   * ignores them has nothing left to stand on and drops through the map.
   */
  private probeGround(
    physics: Physics,
    x: number,
    z: number,
    fromY: number,
    downDist: number
  ): { y: number; ny: number; walkable: boolean } | null {
    const from = new Vector3D(x, fromY, z)
    const to = new Vector3D(x, fromY - downDist, z)
    const hit = physics.raycast(from, to)
    if (!hit.hasHit || !hit.hitPosition) return null
    // Imported map triangles can face either way; only the tilt matters here
    const ny = Math.abs(hit.hitNormal?.y ?? 1)
    return { y: hit.hitPosition.y, ny, walkable: ny >= this.minWalkableNy }
  }

  /** True if a short rise ahead is climbable (stairs / curbs / ramps). */
  private canStepAt(physics: Physics, from: Vector3D, dir: Vector3D, forward: number): boolean {
    const ax = from.x + dir.x * forward
    const az = from.z + dir.z * forward
    const ground = this.probeGround(physics, ax, az, from.y + this.maxStepUp + 0.4, this.maxStepUp + 1.2)
    if (!ground?.walkable) return false
    const stepH = ground.y - from.y
    return stepH >= 0.03 && stepH <= this.maxStepUp
  }

  /**
   * Climb a stair riser / curb in the move direction (same idea as player tryStepUp).
   */
  private tryStepUp(physics: Physics, dir: Vector3D): boolean {
    if (!this.isOnGround) return false
    const flat = dir.clone().setY(0)
    if (flat.lengthSq() < 1e-6) return false
    flat.normalize()

    const distances = [0.35, 0.55, 0.8, 1.05, 1.35]
    for (const forward of distances) {
      const ax = this.position.x + flat.x * forward
      const az = this.position.z + flat.z * forward
      const ground = this.probeGround(
        physics,
        ax,
        az,
        this.position.y + this.maxStepUp + 0.35,
        this.maxStepUp + 1.0
      )
      if (!ground?.walkable) continue
      const stepH = ground.y - this.position.y
      if (stepH < 0.03 || stepH > this.maxStepUp) continue
      // Flat tread preferred; allow mild ramps
      if (ground.ny < 0.65) continue

      // Blocked overhead?
      const head = physics.raycast(
        new Vector3D(ax, this.position.y + 1.4, az),
        new Vector3D(ax, this.position.y + 1.4 + stepH + 0.2, az)
      )
      if (head.hasHit) continue

      this.position.y = ground.y + this.groundSkin
      this.velocityY = 0
      this.isOnGround = true
      return true
    }
    return false
  }

  /**
   * Snap to walkable ground under the feet, or fall with gravity when airborne.
   * Bot position is feet/root (not capsule centre like the player).
   */
  private followTerrain(physics: Physics, dt: number): void {
    // Start the probe just above the feet. Reaching higher grabs whatever is
    // overhead — a door header, the lip of the ledge the bot is standing on —
    // and reads it as "the floor is far above me", which dropped bots through
    // solid ground. Climbing is tryStepUp's job, not this one's.
    // A fresh spawn is the exception: authored spawn heights can sit slightly
    // inside the floor, so the first frame gets one generous settle probe.
    const settling = this.needsGroundSettle
    this.needsGroundSettle = false
    const probeUp = settling ? 4 : 0.6
    const fallProbe = this.isOnGround && !settling ? this.groundSnapDown + 0.15 : 400
    const ground = this.probeGround(
      physics,
      this.position.x,
      this.position.z,
      this.position.y + probeUp,
      probeUp + fallProbe
    )

    if (ground) {
      const targetY = ground.y + this.groundSkin
      const dy = targetY - this.position.y

      if (dy >= -this.groundSnapDown || (settling && dy >= -4)) {
        // On or just above a surface — stick to it (ramps / curbs / small drops)
        this.position.y = targetY
        this.velocityY = 0
        this.isOnGround = true
        return
      }

      // Floor is further below — fall toward it and land exactly on top
      this.isOnGround = false
      this.velocityY -= this.gravity * dt
      this.position.y += this.velocityY * dt
      if (this.position.y <= targetY) {
        this.position.y = targetY
        this.velocityY = 0
        this.isOnGround = true
      }
      return
    }

    // Nothing below at all — void death picks them up after the fall
    this.isOnGround = false
    this.velocityY -= this.gravity * dt
    this.position.y += this.velocityY * dt
  }

  private flatDist(a: Vector3D, b: Vector3D): number {
    const dx = a.x - b.x
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  /**
   * Chance THIS bullet lands, like a real player rather than an aimbot:
   * worse at range, against fast/strafing targets, while the bot itself is
   * moving, right after acquiring the target (aim settle), and as a burst
   * blooms (recoil). Never a guaranteed hit — even hard bots miss.
   */
  private hitChance(dist: number, targetSpeed: number, tune: DifficultyTuning): number {
    const base = this.difficulty === 'hard' ? 0.6 : this.difficulty === 'medium' ? 0.46 : 0.3
    let acc = base

    // Distance falloff
    if (dist < 6) acc *= 1.2
    else if (dist < 14) acc *= 1.0
    else if (dist < 24) acc *= 0.72
    else if (dist < 36) acc *= 0.5
    else acc *= 0.34

    // Moving target — strafers are hard to track
    acc -= Math.min(0.4, targetSpeed * 0.045)

    // Shooting while running is inaccurate
    if (this.isMoving) acc *= 0.6

    // Aim settle: first ~0.8s after acquiring, shots are sloppy
    const settle = Math.min(1, this.seeTimer / 0.8)
    acc *= 0.45 + 0.55 * settle

    // Recoil: sustained fire climbs off target
    acc *= Math.max(0.4, 1 - this.burstCount * 0.09)

    return Math.max(0.05, Math.min(0.9, acc))
  }

  /** Build a shot direction — near the target on a hit, visibly off on a miss. */
  private aimDir(from: Vector3D, target: Vector3D, willHit: boolean, tune: DifficultyTuning): Vector3D {
    const dir = target.clone().sub(from).normalize()
    const spread = willHit ? tune.aimSpread * 0.55 : tune.aimSpread * 6 + 0.06
    dir.x += (Math.random() - 0.5) * spread * 2
    dir.y += (Math.random() - 0.5) * spread * 1.4
    dir.z += (Math.random() - 0.5) * spread * 2
    return dir.normalize()
  }

  private tryShoot(
    player: Player,
    from: Vector3D,
    target: Vector3D,
    tune: DifficultyTuning,
    physics: Physics,
    dist: number,
    targetSpeed: number
  ): void {
    const willHit = Math.random() < this.hitChance(dist, targetSpeed, tune)
    const dir = this.aimDir(from, target, willHit, tune)
    this.lastShotDir.copy(dir)

    // Close range: player capsule often blocks eye→eye rays — skip wall check under ~5m
    const close = dist < 5.5
    let blockedByWall = false
    if (!close) {
      const to = from.clone().add(dir.clone().multiplyScalar(tune.engageRange + 10))
      const hit = physics.raycast(from, to)
      if (hit.hasHit && hit.hitPosition && hit.hitPosition.distanceTo(from) < dist - 1.4) {
        blockedByWall = true
      }
    }

    const game = Game.getInstance()
    void game.audioManager.playShot(this.weaponKey, from)
    game.renderer?.projectileManager.spawn(from, dir, undefined, 850)
    game.renderer?.muzzleFlashManager.spawn(from.clone().add(dir.clone().multiplyScalar(0.4)), dir)
    this.shootFlash = 0.14
    this.burstCount++

    if (willHit && !blockedByWall && player.isAlive && dist < tune.engageRange) {
      // Close = deadly, far = chip damage
      const falloff = this.damageFalloff(dist, tune)
      const result = player.takeDamage(falloff, this.name)
      if (result.killed) {
        this.kills++
      }
    }

    // Dump faster when in your face
    const fireScale = dist < 5 ? 0.55 : dist < 12 ? 0.85 : 1.15
    this.fireCooldown = tune.fireInterval * fireScale * (0.85 + Math.random() * 0.3)
  }

  private tryShootBot(
    victim: TrainingBot,
    from: Vector3D,
    target: Vector3D,
    tune: DifficultyTuning,
    physics: Physics,
    dist: number,
    targetSpeed: number
  ): void {
    const willHit = Math.random() < this.hitChance(dist, targetSpeed, tune)
    const dir = this.aimDir(from, target, willHit, tune)
    this.lastShotDir.copy(dir)

    const close = dist < 5.5
    let blockedByWall = false
    if (!close) {
      const to = from.clone().add(dir.clone().multiplyScalar(tune.engageRange + 10))
      const hit = physics.raycast(from, to)
      if (hit.hasHit && hit.hitPosition && hit.hitPosition.distanceTo(from) < dist - 1.4) {
        blockedByWall = true
      }
    }

    const game = Game.getInstance()
    void game.audioManager.playShot(this.weaponKey, from)
    game.renderer?.projectileManager.spawn(from, dir, undefined, 850)
    game.renderer?.muzzleFlashManager.spawn(from.clone().add(dir.clone().multiplyScalar(0.4)), dir)
    this.shootFlash = 0.14
    this.burstCount++

    if (willHit && !blockedByWall && victim.isAlive && dist < tune.engageRange) {
      const falloff = this.damageFalloff(dist, tune)
      const result = victim.takeBotDamage(falloff, this.name)
      if (result.killed) {
        this.kills++
        game.onBotKilledByBot(this, victim)
      }
    }

    const fireScale = dist < 5 ? 0.55 : dist < 12 ? 0.85 : 1.15
    this.fireCooldown = tune.fireInterval * fireScale * (0.85 + Math.random() * 0.3)
  }

  /** Near = full / bonus damage; far = much weaker */
  private damageFalloff(dist: number, tune: DifficultyTuning): number {
    if (dist < 4) return Math.round(tune.damage * 1.55)
    if (dist < 8) return Math.round(tune.damage * 1.2)
    if (dist < 16) return tune.damage
    if (dist < 28) return Math.round(tune.damage * 0.65)
    return Math.max(4, Math.round(tune.damage * 0.35))
  }

  private hasLineOfSight(physics: Physics, from: Vector3D, to: Vector3D): boolean {
    const dist = from.distanceTo(to)
    // Capsule always "hits" at point-blank — treat as clear LOS when very close
    if (dist < 5.5) return true
    const hit = physics.raycast(from, to)
    if (!hit.hasHit || !hit.hitPosition) return true
    // Allow hitting the player capsule (within ~1.6 of eye) as clear LOS
    return hit.hitPosition.distanceTo(from) >= dist - 1.6
  }

  private faceToward(target: Vector3D): void {
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (Math.abs(dx) + Math.abs(dz) < 0.001) return
    this.yaw = Math.atan2(dx, dz)
  }

  private faceDir(dir: Vector3D): void {
    if (dir.lengthSq() < 0.0001) return
    this.yaw = Math.atan2(dir.x, dir.z)
  }

  public rebuildHitboxShapes(): void {
    /* no-op */
  }
  public syncHitboxes(): void {
    /* no-op */
  }
  public worldOffset(local: Vector3D): Vector3D {
    return new Vector3D(this.position.x + local.x, this.position.y + local.y, this.position.z + local.z)
  }
}

/** @deprecated */
export interface HitboxDef {
  part: BodyPart
  halfSize: Vector3D
  localOffset: Vector3D
}

export const BOT_HITBOX_DEFS: HitboxDef[] = []
export const HITBOX_DEBUG_COLORS: Record<BodyPart, number> = {
  head: 0xff2222,
  body: 0xffcc00,
  legs: 0x22aaff,
}
