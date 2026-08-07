import { Vector3D } from './Vector'
import { Physics } from '../Physics/Physics'
import { BodyPart, damageAtRange, damageForBodyPart } from './BodyPart'
import { IUpdatable } from '../Interface/IUpdatable'
import { Game } from '../Game'
import type { Player } from './Player'
import type { Team } from './Teams'
import {
  pathToVectors,
  routeForRole,
  type Dust2Role,
  type Dust2Site,
  type TacticPoint,
} from './Dust2Tactics'
import { NetPoseBuffer, type PoseSample } from '../Net/NetInterp'
import { separatePair } from './PawnSeparation'
import { botAiSkipFrames, botLodFromDistSq, flatDistSq, type BotLod } from './BotPerf'
import { isTouchDevice } from '../UI/MobileDevice'

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
  /** Dust II TDM role (Long / B / Mid hold, etc.) */
  public tacticRole: Dust2Role | null = null
  public tacticSite: Dust2Site | null = null
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
  public netTPitch = 0
  public hasNetTarget = false
  private netPoseBuffer = new NetPoseBuffer()
  /** Where the body is aiming vertically (radians, + = up) — drives spine / gun tilt */
  public aimPitch = 0
  /** Move intent in the bot's own frame: +z forward, +x right. Smoothed for the gait. */
  public moveX = 0
  public moveZ = 0
  public netMoveX = 0
  public netMoveZ = 0
  public isAirborne = false
  public isReloadingNet = false
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
  private readonly probeDist = 3.6
  private readonly stepProbe = 1.2
  private readonly bodyRadius = 0.9
  private readonly wallPrefer = 1.55
  private readonly planProbe = 5.2
  private escapeTimer = 0
  private escapeDir?: Vector3D
  private repathTimer = 0
  private huntBias = Math.random() < 0.6 ? 'player' : 'any'
  private navMem: Vector3D[] = []
  private navMemAcc = 0
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

  /** execute → walk route, hold → anchor, rotate → CT help site, free → old DM AI */
  private tacticMode: 'execute' | 'hold' | 'rotate' | 'free' = 'free'
  private tacticPath: Vector3D[] = []
  private tacticPathIndex = 0
  private holdCenter?: Vector3D
  private holdLookAt?: Vector3D
  private holdRadius = 12
  private holdStrafeT = 0
  /**
   * Only abandon route/hold for a fight this close.
   * Farther threats with LOS still wait unless they're near our site (CS-style).
   */
  private readonly tacticFightRange = 18
  private readonly tacticEngageLosRange = 28
  /** While true, movement must not overwrite yaw (keep gun on target). */
  private lockCombatFacing = false
  /** Soft body radius vs player / other bots (XZ). */
  private readonly pawnRadius = 0.95
  private readonly playerRadius = 0.85
  /** Distance LOD vs local player — drives AI skip + renderer cheap path. */
  public renderLod: BotLod = 'near'
  /**
   * Set by Game each frame — only budgeted bots run combatThink / heavy nav.
   * Others glide + snap to ground (demo-like CPU, live combat still works).
   */
  public preferFullThink = false
  private aiSkipCounter = 0
  private wallPushCache = new Vector3D()
  private wallPushCacheT = 0
  private groundCacheY = 0
  private groundCacheT = 0
  private corridorCacheKey = ''
  private corridorCacheT = 0
  private corridorCacheOk = true

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
    this.forceRoundReset(pos)
  }

  /** Round reset / freeze: full HP at a spawn without waiting on death timer. */
  public forceRoundReset(pos: Vector3D): void {
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
    this.groundCacheT = 0
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
    this.escapeTimer = 0
    this.escapeDir = undefined
    this.navMem = []
    if (this.tacticRole) this.assignDust2Tactic(this.tacticRole)
  }

  /** CS-style default / hold for Dust II TDM. */
  public assignDust2Tactic(role: Dust2Role): void {
    const route = routeForRole(role)
    this.tacticRole = role
    this.tacticSite = route.site
    this.applyTacticPath(route.path, route.holdRadius, 'execute', route.lookAt)
  }

  /** CT rotate to a threatened site (keeps role label for re-hold later). */
  public rotateDust2To(path: ReadonlyArray<TacticPoint>, holdRadius: number, site: Dust2Site): void {
    this.tacticSite = site
    this.applyTacticPath(path, holdRadius, 'rotate')
  }

  public clearTactic(): void {
    this.tacticRole = null
    this.tacticSite = null
    this.tacticMode = 'free'
    this.tacticPath = []
    this.tacticPathIndex = 0
    this.holdCenter = undefined
    this.holdLookAt = undefined
  }

  private applyTacticPath(
    path: ReadonlyArray<TacticPoint>,
    holdRadius: number,
    mode: 'execute' | 'rotate',
    lookAt?: TacticPoint
  ): void {
    this.tacticPath = pathToVectors(path)
    this.tacticPathIndex = 0
    this.holdRadius = holdRadius
    this.holdCenter = this.tacticPath.length
      ? this.tacticPath[this.tacticPath.length - 1].clone()
      : undefined
    this.holdLookAt = lookAt
      ? new Vector3D(lookAt.x, lookAt.y, lookAt.z)
      : this.holdCenter?.clone()
    this.tacticMode = this.tacticPath.length ? mode : 'hold'
    this.waypoint = undefined
  }

  public pushNetSample(sample: PoseSample): void {
    this.netPoseBuffer.push(sample)
    this.hasNetTarget = true
  }

  public update(dt: number): void {
    if (this.isNetworkPuppet) {
      if (this.hasNetTarget) {
        const delay = Game.getInstance().getNetInterpDelay()
        const renderT = performance.now() / 1000 - delay
        const sample = this.netPoseBuffer.sampleAt(renderT)
        if (sample) {
          this.netTX = sample.x
          this.netTY = sample.y
          this.netTZ = sample.z
          this.netTYaw = sample.yaw
          this.netTPitch = sample.pitch
        }
        // Ease toward the delayed sample so 20 Hz packets don't stair-step
        const k = Math.min(1, dt * 18)
        this.position.x += (this.netTX - this.position.x) * k
        this.position.y += (this.netTY - this.position.y) * k
        this.position.z += (this.netTZ - this.position.z) * k
        let dy = this.netTYaw - this.yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        this.yaw += dy * k
        this.aimPitch += (this.netTPitch - this.aimPitch) * k
        // Snapshots arrive at 20 Hz, so easing the move axes keeps the gait from
        // snapping between strafe and forward on every packet
        const mk = Math.min(1, dt * 9)
        this.moveX += (this.netMoveX - this.moveX) * mk
        this.moveZ += (this.netMoveZ - this.moveZ) * mk
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
      if (!Game.getInstance().shouldHoldRespawn() && this.deathAge >= this.deathDuration) {
        this.respawn()
      }
      return
    }

    if (this.checkVoidDeath()) return

    // Editor dummy / playdemo — stay planted; force far LOD so render matches demo cost
    if (this.aiFrozen) {
      this.renderLod = 'far'
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
      this.renderLod = 'far'
      this.isMoving = false
      this.idlePatrol(dt, physics)
      this.followTerrain(physics, dt)
      this.checkVoidDeath()
      return
    }

    if (this.wallPushCacheT > 0) this.wallPushCacheT = Math.max(0, this.wallPushCacheT - dt)
    if (this.corridorCacheT > 0) this.corridorCacheT = Math.max(0, this.corridorCacheT - dt)
    if (this.groundCacheT > 0) this.groundCacheT = Math.max(0, this.groundCacheT - dt)

    const distSq = flatDistSq(
      this.position.x,
      this.position.z,
      player.position.x,
      player.position.z
    )
    this.renderLod = botLodFromDistSq(distSq)
    const heavyMap = game.activeMapId === 'de_dust2'
    const skipN = botAiSkipFrames(this.renderLod, isTouchDevice(), heavyMap)
    this.aiSkipCounter++
    const lodAllowsFull = skipN <= 0 || this.aiSkipCounter % (skipN + 1) === 0
    // Global frame budget (preferFullThink) + LOD — demo freezes AI entirely; we stagger it
    const runFull = this.preferFullThink && lodAllowsFull

    if (!runFull) {
      // Cheap frame: glide only — do not stack pendingAiDt or full think will burst-move
      this.fireCooldown = Math.max(0, this.fireCooldown - dt)
      this.strafeTimer -= dt
      this.retargetTimer -= dt
      const cheapSpeed = TUNING[this.difficulty].moveSpeed * 0.85
      if (this.lastKnownTarget && this.flatDist(this.position, this.lastKnownTarget) > 1.4) {
        this.glideToward(this.lastKnownTarget, cheapSpeed, dt, physics)
      } else if (this.tacticMode !== 'free' && this.waypoint) {
        this.glideToward(this.waypoint, cheapSpeed * 0.85, dt, physics)
      } else {
        this.isMoving = false
      }
      this.followTerrain(physics, dt)
      this.checkVoidDeath()
      if (this.shootFlash > 0) this.shootFlash = Math.max(0, this.shootFlash - dt)
      this.trackAimAndGait(dt)
      return
    }

    this.combatThink(dt, player, physics)
    this.applyPawnSeparation(player)
    this.followTerrain(physics, dt)
    this.checkVoidDeath()
    if (this.shootFlash > 0) this.shootFlash = Math.max(0, this.shootFlash - dt)
    this.trackAimAndGait(dt)
  }

  /**
   * Budget-frame slide: still refuse steps with no floor under them so bots
   * cannot XZ-glide off ledges while a stale ground cache freezes Y.
   */
  private glideToward(goal: Vector3D, speed: number, dt: number, physics: Physics): void {
    const dx = goal.x - this.position.x
    const dz = goal.z - this.position.z
    const len = Math.hypot(dx, dz)
    if (len < 0.45) {
      this.isMoving = false
      return
    }
    const step = Math.min(speed * dt, len)
    const nx = this.position.x + (dx / len) * step
    const nz = this.position.z + (dz / len) * step
    if (!this.hasGroundNear(physics, nx, nz)) {
      this.isMoving = false
      this.groundCacheT = 0
      return
    }
    this.position.x = nx
    this.position.z = nz
    this.groundCacheT = 0
    this.isMoving = true
    if (!this.lockCombatFacing) this.faceToward(goal)
  }

  /** Keep bots / player from stacking and orbiting inside each other. */
  private applyPawnSeparation(player: Player): void {
    const game = Game.getInstance()
    const minBot = this.pawnRadius * 2

    for (const other of game.trainingBots) {
      if (other === this || !other.isAlive || other.aiFrozen) continue
      // Only the lower-name bot applies the pair fix (avoid double push)
      if (this.name > other.name) continue
      const out = separatePair(
        { x: this.position.x, z: this.position.z },
        { x: other.position.x, z: other.position.z },
        minBot,
        0.5
      )
      if (!out) continue
      this.position.x = out.a.x
      this.position.z = out.a.z
      this.groundCacheT = 0
      other.position.x = out.b.x
      other.groundCacheT = 0
      other.position.z = out.b.z
    }

    if (player.isDead) return
    const minPlayer = this.pawnRadius + this.playerRadius
    const out = separatePair(
      { x: this.position.x, z: this.position.z },
      { x: player.position.x, z: player.position.z },
      minPlayer,
      0.55
    )
    if (!out) return
    this.position.x = out.a.x
    this.position.z = out.a.z
    this.groundCacheT = 0
    player.nudgeHorizontal(out.b.x - player.position.x, out.b.z - player.position.z)
  }

  /** AI bots walk where they look, so the gait is forward-only; aim follows the last shot. */
  private trackAimAndGait(dt: number): void {
    const k = Math.min(1, dt * 9)
    this.moveX += (0 - this.moveX) * k
    this.moveZ += ((this.isMoving ? 1 : 0) - this.moveZ) * k
    const want = Math.asin(Math.max(-1, Math.min(1, this.lastShotDir.y)))
    this.aimPitch += (want - this.aimPitch) * Math.min(1, dt * 6)
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
    if (this.tacticMode !== 'free' && this.runTacticMove(dt, physics, tune.moveSpeed)) return
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

  /** Walk route waypoints, then micro-strafe on the hold. */
  private runTacticMove(dt: number, physics: Physics, speed: number): boolean {
    if (this.tacticMode === 'free') return false

    if (this.tacticMode === 'execute' || this.tacticMode === 'rotate') {
      while (this.tacticPathIndex < this.tacticPath.length) {
        const wp = this.tacticPath[this.tacticPathIndex]
        const d = this.flatDist(this.position, wp)
        if (d <= 4.2) {
          this.tacticPathIndex++
          this.waypoint = undefined
          this.stuckTimer = 0
          continue
        }
        this.navigateToward(wp, speed * (this.tacticMode === 'rotate' ? 1.2 : 1.0), dt, physics)
        return true
      }
      this.tacticMode = 'hold'
    }

    if (this.tacticMode === 'hold' && this.holdCenter) {
      this.holdStrafeT += dt
      const anchor = this.holdCenter
      const look = this.holdLookAt ?? anchor
      const d = this.flatDist(this.position, anchor)
      if (d > this.holdRadius) {
        this.navigateToward(anchor, speed * 0.85, dt, physics)
        this.faceToward(look)
        return true
      }
      // CS-style: mostly plant and watch the choke; tiny counter-strafe only
      const ang = this.holdStrafeT * 0.35 + this.patrolAngle
      const r = Math.min(this.holdRadius * 0.22, 2.2)
      const jig = new Vector3D(anchor.x + Math.cos(ang) * r, this.position.y, anchor.z + Math.sin(ang) * r)
      if (this.flatDist(this.position, jig) > 0.55) {
        this.navigateToward(jig, speed * 0.22, dt, physics)
      } else {
        this.isMoving = false
      }
      this.faceToward(look)
      return true
    }
    return false
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

    // Dust II: finish defaults / hold angles unless the fight is on us (CS-style)
    if (this.tacticMode !== 'free') {
      const threatDist = threat ? this.flatDist(this.position, threat.pos) : Infinity
      const hasThreatLos =
        !!threat &&
        threatDist < this.tacticEngageLosRange &&
        this.hasLineOfSight(physics, myEye, threat.eye)
      const nearHold =
        !!threat &&
        !!this.holdCenter &&
        this.flatDist(threat.pos, this.holdCenter) < this.holdRadius + 16
      const mustFight =
        !!threat &&
        (threatDist < this.tacticFightRange || (hasThreatLos && (nearHold || this.tacticMode === 'rotate')))
      if (!mustFight) {
        if (!threat) this.seeTimer = 0
        if (this.runTacticMove(dt, physics, tune.moveSpeed)) return
      }
    }

    if (!threat) {
      this.seeTimer = 0
      // Hunt last known position, then roam / hold
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
    this.lockCombatFacing = hasLos

    const ideal = 8
    let goal = moveGoalBase.clone()

    if (hasLos && dist < 4.2) {
      // Stick and dump — backpedal / stand. Never orbit (that caused 360 spins).
      const forward = toTarget.clone().setY(0)
      if (forward.lengthSq() > 0.01) {
        forward.normalize()
        if (dist < 2.4) {
          goal = this.position.clone().add(forward.clone().multiplyScalar(-2.2))
        } else {
          goal = this.position.clone()
          this.isMoving = false
        }
      } else {
        goal = this.position.clone()
        this.isMoving = false
      }
    } else if (hasLos && dist > ideal - 2 && dist < ideal + 4) {
      // Mid-range counter-strafe — longer holds, no frantic sign flips
      if (this.strafeTimer <= 0) {
        const flipChance = this.tacticMode !== 'free' ? tune.strafeChance * 0.35 : tune.strafeChance
        this.strafeSign *= Math.random() < flipChance ? -1 : 1
        this.strafeTimer = 0.55 + Math.random() * 0.7
      }
      const forward = toTarget.clone().setY(0).normalize()
      const side = new Vector3D(-forward.z, 0, forward.x).multiplyScalar(this.strafeSign * 2.4)
      goal = this.position.clone().add(side).add(forward.multiplyScalar(1.2))
    } else {
      // Sprint to them — predict slightly toward their position
      goal = moveGoalBase.clone()
    }

    // Faster when hunting / no LOS; still quick in gunfights
    const chaseSpeed =
      !hasLos || dist > 22 ? tune.moveSpeed * 1.35 : dist > 12 ? tune.moveSpeed * 1.15 : tune.moveSpeed
    if (!(hasLos && dist >= 2.4 && dist < 4.2 && this.flatDist(this.position, goal) < 0.35)) {
      this.navigateToward(goal, chaseSpeed, dt, physics)
    }
    if (this.lockCombatFacing) this.faceToward(targetPos)

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
      const score = d - playerBias
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
    // One LOS check on the best candidate (was N rays across every nearby enemy)
    const best = cands[0]
    if (best.dist < 36 && this.hasLineOfSight(physics, myEye, best.eye)) {
      best.score -= best.kind === 'player' ? 16 : 14
    } else if (cands.length > 1 && cands[1].dist < 28) {
      const alt = cands[1]
      if (this.hasLineOfSight(physics, myEye, alt.eye)) return { kind: alt.kind, eye: alt.eye, pos: alt.pos, bot: alt.bot }
    }
    return { kind: best.kind, eye: best.eye, pos: best.pos, bot: best.bot }
  }

  private navigateToward(goal: Vector3D, speed: number, dt: number, physics: Physics): void {
    this.navMemAcc += dt
    if (this.navMemAcc > 0.2) {
      this.navMemAcc = 0
      this.navMem.push(this.position.clone())
      if (this.navMem.length > 8) this.navMem.shift()
    }

    if (this.escapeTimer > 0) {
      this.escapeTimer -= dt
      const dir = this.escapeDir
      if (dir && this.isCorridorClear(physics, dir, this.stepProbe * 1.3)) {
        this.stepAlong(dir, speed * 1.15, dt)
        this.faceDir(dir)
        return
      }
      this.escapeTimer = 0
      this.escapeDir = undefined
    }

    if (this.isCornered(physics) || this.isSpinningInPlace()) {
      if (this.beginCornerEscape(physics, goal)) return
    }

    if (this.waypoint && this.flatDist(this.position, this.waypoint) < 1.1) {
      this.waypoint = undefined
    }
    if (this.repathTimer > 0) this.repathTimer -= dt
    if (this.repathTimer <= 0 && this.waypoint && !this.canWalkToward(physics, this.waypoint)) {
      this.waypoint = undefined
      this.repathTimer = 0.12
    }

    let target = this.waypoint ?? goal
    const direct = this.canWalkToward(physics, goal)
    if (!this.canWalkToward(physics, target) || (!this.waypoint && !direct)) {
      const detour = this.findDetour(physics, goal)
      if (detour) {
        this.waypoint = detour
        target = detour
        this.repathTimer = 0.35
      } else if (!direct) {
        if (this.beginCornerEscape(physics, goal)) return
        this.wallFollowSideStep(physics, goal, speed, dt)
        return
      } else {
        target = goal
        this.waypoint = undefined
      }
    } else if (!this.waypoint && direct) {
      target = goal
    }

    this.stepWithCollision(physics, target, speed, dt)
  }

  private isSpinningInPlace(): boolean {
    if (this.navMem.length < 5) return false
    let travel = 0
    for (let i = 1; i < this.navMem.length; i++) {
      travel += this.flatDist(this.navMem[i - 1], this.navMem[i])
    }
    return travel < 1.4 && this.stuckTimer > 0.25
  }

  private isCornered(physics: Physics): boolean {
    const forward = new Vector3D(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const left = new Vector3D(-forward.z, 0, forward.x)
    const right = new Vector3D(forward.z, 0, -forward.x)
    const back = forward.clone().multiplyScalar(-1)
    const fwd = !this.isCorridorClear(physics, forward, this.wallPrefer)
    const l = !this.isCorridorClear(physics, left, this.wallPrefer * 0.85)
    const r = !this.isCorridorClear(physics, right, this.wallPrefer * 0.85)
    const b = this.isCorridorClear(physics, back, this.probeDist)
    return fwd && l && r && b
  }

  private beginCornerEscape(physics: Physics, goal: Vector3D): boolean {
    const toGoal = goal.clone().sub(this.position).setY(0)
    if (toGoal.lengthSq() > 0.01) toGoal.normalize()
    else toGoal.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))

    const samples: Vector3D[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      samples.push(new Vector3D(Math.cos(a), 0, Math.sin(a)))
    }
    let best: Vector3D | undefined
    let bestScore = -Infinity
    for (const dir of samples) {
      if (!this.isCorridorClear(physics, dir, this.probeDist)) continue
      const toward = dir.x * toGoal.x + dir.z * toGoal.z
      const score = this.wallDistance(physics, dir, this.planProbe) * 0.2 + toward * 1.4
      if (score > bestScore) {
        bestScore = score
        best = dir
      }
    }
    if (!best) {
      this.wallFollowDir *= -1
      return false
    }
    this.escapeDir = best
    this.escapeTimer = 0.55 + Math.random() * 0.35
    this.waypoint = this.position.clone().add(best.clone().multiplyScalar(4.5))
    this.stuckTimer = 0
    this.navMem = []
    this.stepAlong(best, TUNING[this.difficulty].moveSpeed * 1.2, 0.05)
    this.faceDir(best)
    return true
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
      side,
      side.clone().multiplyScalar(-1),
      toGoal.clone().multiplyScalar(-1),
    ]
    let best: Vector3D | undefined
    let bestScore = -Infinity
    for (const dir of tryDirs) {
      if (!this.isCorridorClear(physics, dir, this.stepProbe * 1.2)) continue
      const toward = dir.x * toGoal.x + dir.z * toGoal.z
      const score = toward + this.wallDistance(physics, dir, this.planProbe) * 0.15
      if (score > bestScore) {
        bestScore = score
        best = dir
      }
    }
    if (best) {
      this.stepAlong(best, speed * 1.08, dt)
      this.faceDir(best)
      return
    }
    this.wallFollowDir *= -1
    this.stuckTimer += dt
    this.isMoving = false
  }

  private findDetour(physics: Physics, goal: Vector3D): Vector3D | undefined {
    const toGoal = goal.clone().sub(this.position).setY(0)
    const dist = toGoal.length()
    if (dist < 0.2) return undefined
    toGoal.normalize()

    // Compact search — old 21×6 ray grid spiked FPS whenever a bot got stuck
    const angles = [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, Math.PI]
    const stepLens = [3.4, 6.4, 10]
    let best: Vector3D | undefined
    let bestScore = Number.POSITIVE_INFINITY

    for (const a of angles) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      const dir = new Vector3D(toGoal.x * c - toGoal.z * s, 0, toGoal.x * s + toGoal.z * c)
      if (!this.isCorridorClear(physics, dir, this.probeDist)) continue

      for (const stepLen of stepLens) {
        const step = this.position.clone().add(dir.clone().multiplyScalar(stepLen))
        if (!this.hasGroundNear(physics, step.x, step.z)) continue
        const remain = this.flatDist(step, goal)
        const score = remain + Math.abs(a) * 0.55
        if (score < bestScore) {
          bestScore = score
          best = step
        }
      }
    }

    if (best) this.wallFollowDir = best.x * -toGoal.z + best.z * toGoal.x >= 0 ? 1 : -1
    return best
  }

  private stepWithCollision(physics: Physics, target: Vector3D, speed: number, dt: number): void {
    const delta = target.clone().sub(this.position)
    delta.y = 0
    const len = delta.length()
    if (len < 0.18) {
      this.isMoving = false
      return
    }
    let dir = delta.clone().normalize()
    dir = this.steerAwayFromWalls(physics, dir)
    this.faceDir(dir)

    if (!this.isCorridorClear(physics, dir, this.stepProbe)) {
      for (const a of [0.35, -0.35, 0.7, -0.7, 1.15, -1.15, 1.7, -1.7]) {
        const c = Math.cos(a)
        const s = Math.sin(a)
        const slide = new Vector3D(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c)
        if (this.isCorridorClear(physics, slide, this.stepProbe)) {
          this.stuckTimer = Math.max(0, this.stuckTimer - dt)
          this.stepAlong(slide, speed * 0.95, dt)
          return
        }
      }
      this.isMoving = false
      this.stuckTimer += dt
      if (this.stuckTimer > 0.28) {
        this.waypoint = undefined
        this.wallFollowDir *= -1
        this.beginCornerEscape(physics, target)
        this.stuckTimer = 0
      }
      return
    }

    this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2)
    this.stepAlong(dir, speed, dt)
  }

  private steerAwayFromWalls(physics: Physics, desired: Vector3D): Vector3D {
    const flat = desired.clone().setY(0)
    if (flat.lengthSq() < 1e-8) return desired
    flat.normalize()
    const push = this.wallRepulsion(physics)
    if (push.lengthSq() < 1e-6) return flat
    const blended = flat.clone().multiplyScalar(1.15).add(push.multiplyScalar(1.6))
    if (blended.lengthSq() < 1e-6) return flat
    blended.normalize()
    if (!this.isCorridorClear(physics, blended, this.stepProbe)) return flat
    return blended
  }

  private wallRepulsion(physics: Physics): Vector3D {
    if (this.wallPushCacheT > 0) {
      return this.wallPushCache.clone()
    }
    const push = new Vector3D()
    // Was 12 rings × 3 heights = 36 rays; 6 × 1 is enough to slide off walls
    const rings = 6
    for (let i = 0; i < rings; i++) {
      const a = (i / rings) * Math.PI * 2
      const dir = new Vector3D(Math.cos(a), 0, Math.sin(a))
      const dist = this.wallDistance(physics, dir, this.wallPrefer * 1.8)
      if (dist >= this.wallPrefer) continue
      const strength = 1 - dist / this.wallPrefer
      push.x -= dir.x * strength * strength
      push.z -= dir.z * strength * strength
    }
    this.wallPushCache.copy(push)
    this.wallPushCacheT = 0.12
    return push
  }

  private wallDistance(physics: Physics, dir: Vector3D, maxDist: number): number {
    const flat = dir.clone().setY(0)
    if (flat.lengthSq() < 1e-8) return maxDist
    flat.normalize()
    const origin = this.position.clone().add(new Vector3D(0, 1.05, 0))
    const end = origin.clone().add(flat.clone().multiplyScalar(maxDist))
    const hit = physics.raycast(origin, end)
    if (!hit.hasHit || !hit.hitPosition) return maxDist
    if (hit.hitNormal && Math.abs(hit.hitNormal.y) >= this.minWalkableNy) return maxDist
    return hit.hitPosition.distanceTo(origin)
  }

  private clearanceAt(physics: Physics, at: Vector3D): number {
    let min = this.wallPrefer * 2
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const dir = new Vector3D(Math.cos(a), 0, Math.sin(a))
      const origin = at.clone().add(new Vector3D(0, 1.05, 0))
      const end = origin.clone().add(dir.clone().multiplyScalar(this.wallPrefer * 2))
      const hit = physics.raycast(origin, end)
      if (!hit.hasHit || !hit.hitPosition) continue
      if (hit.hitNormal && Math.abs(hit.hitNormal.y) >= this.minWalkableNy) continue
      min = Math.min(min, hit.hitPosition.distanceTo(origin))
    }
    return min
  }

  private opennessAhead(physics: Physics, dir: Vector3D, dist: number): number {
    let open = 0
    const spreads = [0, 0.55, -0.55]
    for (const a of spreads) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      const d = new Vector3D(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c)
      open += this.wallDistance(physics, d, dist) / dist
    }
    return open / spreads.length
  }

  private hasGroundNear(physics: Physics, x: number, z: number): boolean {
    const g = this.probeGround(physics, x, z, this.position.y + 2.5, 6)
    return !!g?.walkable
  }

  private stepAlong(dir: Vector3D, speed: number, dt: number): void {
    const physics = Game.getInstance().getPhysics()
    const steered = this.steerAwayFromWalls(physics, dir)
    const use = this.isCorridorClear(physics, steered, this.stepProbe) ? steered : dir
    if (!this.isCorridorClear(physics, use, this.stepProbe * 0.7)) {
      this.isMoving = false
      return
    }
    const step = Math.min(speed * dt, this.stepProbe * 0.85)
    this.tryStepUp(physics, use)
    this.position.x += use.x * step
    this.position.z += use.z * step
    this.isMoving = true
  }

  private canWalkToward(physics: Physics, target: Vector3D, from = this.position): boolean {
    const delta = target.clone().sub(from)
    delta.y = 0
    const len = delta.length()
    if (len < 0.1) return true
    return this.isCorridorClear(physics, delta.normalize(), Math.min(len, this.planProbe), from)
  }

  private isCorridorClear(
    physics: Physics,
    dir: Vector3D,
    distance: number,
    from = this.position
  ): boolean {
    const flat = dir.clone().setY(0)
    if (flat.lengthSq() < 1e-8) return true
    flat.normalize()
    // Short-lived cache — stepAlong used to fire this 2–3× per move with identical args
    const key = `${from.x.toFixed(1)},${from.z.toFixed(1)},${flat.x.toFixed(2)},${flat.z.toFixed(2)},${distance.toFixed(1)}`
    if (this.corridorCacheT > 0 && this.corridorCacheKey === key) return this.corridorCacheOk

    const side = new Vector3D(-flat.z, 0, flat.x)
    // Was 3 offsets × 3 heights = 9 rays; center + sides at chest height is enough
    const offsets = [0, this.bodyRadius * 0.72, -this.bodyRadius * 0.72]
    let ok = true
    for (const off of offsets) {
      const origin = from.clone().add(side.clone().multiplyScalar(off)).add(new Vector3D(0, 1.05, 0))
      const end = origin.clone().add(flat.clone().multiplyScalar(distance))
      const hit = physics.raycast(origin, end)
      if (!hit.hasHit || !hit.hitPosition) continue
      const hitDist = hit.hitPosition.distanceTo(origin)
      if (hitDist > distance - 0.1) continue
      if (hit.hitNormal && Math.abs(hit.hitNormal.y) >= this.minWalkableNy) continue
      if (off === 0 && this.canStepAt(physics, from, flat, Math.min(distance, 1.35))) {
        continue
      }
      ok = false
      break
    }
    this.corridorCacheKey = key
    this.corridorCacheT = 0.08
    this.corridorCacheOk = ok
    return ok
  }

  private isDirClear(physics: Physics, dir: Vector3D, distance: number, from = this.position): boolean {
    return this.isCorridorClear(physics, dir, distance, from)
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

    const distances = [0.45, 0.85, 1.25]
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

    // Only reuse ground Y while planted AND not sliding in XZ — a moving cache
    // was freezing feet height while budget glides walked off ledges.
    if (
      !settling &&
      !this.isMoving &&
      this.isOnGround &&
      this.groundCacheT > 0 &&
      Math.abs(this.velocityY) < 0.01
    ) {
      this.position.y = this.groundCacheY
      return
    }

    const probeUp = settling ? 4 : 0.6
    const fallProbe = this.isOnGround && !settling ? this.groundSnapDown + 0.15 : 400
    let ground = this.probeGround(
      physics,
      this.position.x,
      this.position.z,
      this.position.y + probeUp,
      probeUp + fallProbe
    )

    // Short grounded probe can miss thin Dust II tris / small drops after a
    // slide — retry deep before treating it as void and falling forever.
    if (!ground && this.isOnGround && !settling) {
      ground = this.probeGround(
        physics,
        this.position.x,
        this.position.z,
        this.position.y + 2.5,
        400
      )
    }

    if (ground) {
      const targetY = ground.y + this.groundSkin
      const dy = targetY - this.position.y
      // Slightly larger snap after a long-probe recover so a 1m miss doesn't void-fall
      const canStick =
        dy <= 4 &&
        (dy >= -this.groundSnapDown || (settling && dy >= -4) || dy >= -1.5)

      if (canStick) {
        this.position.y = targetY
        this.velocityY = 0
        this.isOnGround = true
        this.groundCacheY = targetY
        this.groundCacheT = this.isMoving ? 0 : 0.08
        return
      }

      // Floor is further below — fall toward it and land exactly on top
      this.isOnGround = false
      this.groundCacheT = 0
      this.velocityY -= this.gravity * dt
      this.position.y += this.velocityY * dt
      if (this.position.y <= targetY) {
        this.position.y = targetY
        this.velocityY = 0
        this.isOnGround = true
        this.groundCacheY = targetY
        this.groundCacheT = 0.08
      }
      return
    }

    // Nothing below at all — void death picks them up after the fall
    this.isOnGround = false
    this.groundCacheT = 0
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
    if (this.lockCombatFacing) return
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
