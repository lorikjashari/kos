import { Vector3D } from './Vector'
import { Physics } from '../Physics/Physics'
import { BodyPart, damageForBodyPart } from './BodyPart'
import { IUpdatable } from '../Interface/IUpdatable'
import { Game } from '../Game'
import type { Player } from './Player'

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
  private lastKnownTarget?: Vector3D
  private retargetTimer = 0
  private lockedTargetName?: string

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
    fromPlayer = false
  ): { damage: number; killed: boolean; wasAlive: boolean } {
    const wasAlive = this.isAlive
    if (!this.isAlive) {
      return { damage: 0, killed: false, wasAlive: false }
    }

    const damage = damageForBodyPart(part, weaponKey)
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
    const pos = game.pickRespawnPosition(this.position, true)
    this.health = 100
    this.isAlive = true
    this.deathAge = 0
    this.playerDamageDealt = 0
    this.damagers.clear()
    this.spawnPosition.copy(pos)
    this.position.copy(pos)
    this.lastPos.copy(pos)
    this.yaw = Math.random() * Math.PI * 2
    this.fireCooldown = 0.5 + Math.random()
    this.seeTimer = 0
    this.isMoving = false
    this.waypoint = undefined
    this.stuckTimer = 0
    this.lastKnownTarget = undefined
    this.lockedTargetName = undefined
    this.retargetTimer = 0
  }

  public update(dt: number): void {
    if (!this.isAlive) {
      this.deathAge += dt
      if (this.deathAge >= this.deathDuration) {
        this.respawn()
      }
      return
    }

    const game = Game.getInstance()
    const player = game.currentPlayer?.player
    const physics = game.getPhysics()
    if (!player) {
      this.isMoving = false
      this.idlePatrol(dt, physics)
      return
    }

    // Keep fighting even if the player is dead (bot free-for-all)
    this.combatThink(dt, player, physics)
    if (this.shootFlash > 0) this.shootFlash = Math.max(0, this.shootFlash - dt)
  }

  private idlePatrol(dt: number, physics: Physics): void {
    const tune = TUNING[this.difficulty]
    this.patrolAngle += dt * 0.85
    // Roam farther so they cover the map instead of circling spawn
    const r = this.homeRadius * (0.45 + 0.35 * Math.abs(Math.sin(this.patrolAngle * 0.37)))
    const target = new Vector3D(
      this.spawnPosition.x + Math.cos(this.patrolAngle) * r,
      this.spawnPosition.y,
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
    this.lastKnownTarget.y = this.spawnPosition.y

    const toTarget = targetPos.clone().sub(myEye)
    const dist = toTarget.length()

    // Chase across the whole map; shoot when LOS opens
    const hasLos = dist < tune.engageRange && this.hasLineOfSight(physics, myEye, targetPos)
    if (hasLos) this.seeTimer += dt
    else this.seeTimer = Math.max(0, this.seeTimer - dt * 2)

    this.faceToward(targetPos)

    const ideal = 8
    let goal = moveGoalBase.clone()
    goal.y = this.spawnPosition.y

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
      goal.y = this.spawnPosition.y
    } else if (hasLos && dist > ideal - 2 && dist < ideal + 4) {
      if (this.strafeTimer <= 0) {
        this.strafeSign *= Math.random() < tune.strafeChance ? -1 : 1
        this.strafeTimer = 0.28 + Math.random() * 0.45
      }
      const forward = toTarget.clone().setY(0).normalize()
      const side = new Vector3D(-forward.z, 0, forward.x).multiplyScalar(this.strafeSign * 3.2)
      goal = this.position.clone().add(side).add(forward.multiplyScalar(2.0))
      goal.y = this.spawnPosition.y
    } else {
      // Sprint to them — predict slightly toward their position
      goal = moveGoalBase.clone()
      goal.y = this.spawnPosition.y
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
          this.tryShootBot(threat.bot, myEye, targetPos, tune, physics, dist)
        } else if (!player.isDead) {
          this.tryShoot(player, myEye, targetPos, tune, physics, dist)
        }
      }
    }
  }

  private resolveLockedTarget(
    game: Game,
    player: Player
  ): { kind: 'bot' | 'player'; eye: Vector3D; pos: Vector3D; bot?: TrainingBot } | undefined {
    if (this.lockedTargetName === '__player__' && !player.isDead) {
      return {
        kind: 'player',
        eye: player.position.clone().add(new Vector3D(0, player.eyeOffsetY, 0)),
        pos: player.position.clone(),
      }
    }
    for (const other of game.trainingBots) {
      if (other === this || !other.isAlive) continue
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

    for (const other of game.trainingBots) {
      if (other === this || !other.isAlive) continue
      const d = this.flatDist(this.position, other.position)
      const eye = other.position.clone().add(new Vector3D(0, other.eyeHeight, 0))
      let score = d
      if (other.playerDamageDealt >= 20) score -= 10
      if (other.health < 50) score -= 6
      if (this.huntBias === 'any') score -= 3
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

    if (!player.isDead) {
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
        step.y = this.spawnPosition.y
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
    const step = Math.min(speed * dt, this.stepProbe * 0.9)
    this.position.x += dir.x * step
    this.position.z += dir.z * step
    this.position.y = this.spawnPosition.y
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
    const origin = from.clone().add(new Vector3D(0, 0.9, 0))
    const flat = dir.clone().setY(0)
    if (flat.lengthSq() < 1e-8) return true
    flat.normalize()
    const end = origin.clone().add(flat.multiplyScalar(distance))
    const hit = physics.raycast(origin, end)
    if (!hit.hasHit || !hit.hitPosition) return true
    return hit.hitPosition.distanceTo(origin) > distance - 0.08
  }

  private flatDist(a: Vector3D, b: Vector3D): number {
    const dx = a.x - b.x
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  private tryShoot(
    player: Player,
    from: Vector3D,
    target: Vector3D,
    tune: DifficultyTuning,
    physics: Physics,
    dist: number
  ): void {
    // Tighter aim up close; looser at range
    const rangeT = Math.min(1, Math.max(0, (dist - 4) / Math.max(8, tune.engageRange - 4)))
    const spread = tune.aimSpread * (0.35 + rangeT * 1.4)
    const dir = target.clone().sub(from).normalize()
    dir.x += (Math.random() - 0.5) * spread * 2
    dir.y += (Math.random() - 0.5) * spread * 1.2
    dir.z += (Math.random() - 0.5) * spread * 2
    dir.normalize()
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

    const aimError = Math.acos(Math.min(1, Math.max(-1, dir.dot(target.clone().sub(from).normalize()))))
    const aimOk = aimError < spread * (close ? 4.5 : 2.8)
    const hitPlayer = !blockedByWall && aimOk && dist < tune.engageRange

    const game = Game.getInstance()
    void game.audioManager.playShot(this.weaponKey, from)
    game.renderer?.projectileManager.spawn(from, dir, undefined, 850)
    game.renderer?.muzzleFlashManager.spawn(from.clone().add(dir.clone().multiplyScalar(0.4)), dir)
    this.shootFlash = 0.14

    if (hitPlayer && player.isAlive) {
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
    dist: number
  ): void {
    const rangeT = Math.min(1, Math.max(0, (dist - 4) / Math.max(8, tune.engageRange - 4)))
    const spread = tune.aimSpread * (0.35 + rangeT * 1.4)
    const dir = target.clone().sub(from).normalize()
    dir.x += (Math.random() - 0.5) * spread * 2
    dir.y += (Math.random() - 0.5) * spread * 1.2
    dir.z += (Math.random() - 0.5) * spread * 2
    dir.normalize()
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

    const aimError = Math.acos(Math.min(1, Math.max(-1, dir.dot(target.clone().sub(from).normalize()))))
    const aimOk = aimError < spread * (close ? 4.5 : 2.8)
    const hit = !blockedByWall && aimOk && dist < tune.engageRange

    const game = Game.getInstance()
    void game.audioManager.playShot(this.weaponKey, from)
    game.renderer?.projectileManager.spawn(from, dir, undefined, 850)
    game.renderer?.muzzleFlashManager.spawn(from.clone().add(dir.clone().multiplyScalar(0.4)), dir)
    this.shootFlash = 0.14

    if (hit && victim.isAlive) {
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
