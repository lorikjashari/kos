import { Vector3D } from '../Core/Vector'
import { TrainingBot } from '../Core/TrainingBot'
import { TrainingBotRenderer } from '../View/Renderer/TrainingBotRenderer'
import { Game } from '../Game'
import { NetSession } from './NetSession'
import {
  botTargetForHumans,
  MP_FILL_BOTS,
  MP_TICK_HZ,
  type NetMsg,
  type NetRole,
} from './NetTypes'
import { roomDirectory, RoomDirectory } from './RoomDirectory'
import type { MatchLength, TeamMode } from '../Core/MatchStats'
import type { MapId } from '../Core/MapCatalog'
import { clampTeamSize, DEFAULT_TEAM_SIZE, otherTeam, type Team } from '../Core/Teams'

export type MultiplayerStartConfig = {
  mode: 'host' | 'join'
  roomCode?: string
  playerName: string
  difficulty?: 'easy' | 'medium' | 'hard'
  /** Host-only: how many bots to fill with (0–10). 0 = 1v1 / pure PvP. */
  botCount?: number
  matchLength?: MatchLength
  teamMode?: TeamMode
  /** Host-chosen map; clients adopt from welcome */
  mapId?: MapId
  /** Host-chosen T vs CT deathmatch */
  teamPlay?: boolean
  playerTeam?: Team
  teamSize?: number
}

type HumanRec = { id: string; name: string; team?: Team }

/**
 * Friends multiplayer glue: PeerJS room + snapshot sync + bot fill replace.
 * Host simulates bots; everyone simulates their own player and shares pose/HP.
 */
export class MultiplayerMatch {
  private session: NetSession | null = null
  private role: NetRole = 'offline'
  private roomCode = ''
  private localName = 'Player'
  private fillBots = MP_FILL_BOTS
  private humans = new Map<string, HumanRec>()
  private acc = 0
  private lastShootSent = 0
  private enabled = false
  private pendingShoot = false
  /** Host's choice; clients adopt it from welcome/roster */
  private teamMode: TeamMode = 'ffa'
  private mapId: MapId = 'pool_day'
  private teamPlay = false
  private teamSize = DEFAULT_TEAM_SIZE
  private localTeam: Team = 'CT'

  public get active(): boolean {
    return this.enabled && this.role !== 'offline'
  }

  public get isHost(): boolean {
    return this.role === 'host'
  }

  public get code(): string {
    return this.roomCode
  }

  public getHumanCount(): number {
    return Math.max(1, this.humans.size)
  }

  public getFillBots(): number {
    return this.fillBots
  }

  public async start(config: MultiplayerStartConfig): Promise<{ code: string; role: NetRole }> {
    this.stop()
    this.localName = (config.playerName || 'Player').slice(0, 24)
    this.fillBots = Math.max(0, Math.min(MP_FILL_BOTS, Math.round(config.botCount ?? MP_FILL_BOTS)))
    this.teamMode = config.teamMode ?? 'ffa'
    this.mapId = config.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
    this.teamPlay = !!config.teamPlay && this.mapId === 'de_dust2'
    this.teamSize = clampTeamSize(config.teamSize)
    this.localTeam = config.playerTeam ?? 'CT'
    this.enabled = true
    this.humans.clear()

    const session = new NetSession({
      onReady: () => {},
      onError: (message) => console.warn('[mp]', message),
      onPeerJoined: (peerId) => this.onPeerJoined(peerId),
      onPeerLeft: (peerId) => this.onPeerLeft(peerId),
      onMessage: (fromId, msg) => this.onMessage(fromId, msg),
    })
    this.session = session

    if (config.mode === 'host') {
      const code = await session.createRoom()
      this.role = 'host'
      this.roomCode = code
      this.humans.set(session.localPeerId, {
        id: session.localPeerId,
        name: this.localName,
        team: this.teamPlay ? this.localTeam : undefined,
      })
      void roomDirectory.startHosting({
        code,
        host: this.localName,
        players: 1,
        max: RoomDirectory.MAX_PLAYERS,
        mapId: this.mapId,
      })
      return { code, role: 'host' }
    }

    if (!config.roomCode) throw new Error('Room code required')
    await session.joinRoom(config.roomCode)
    this.role = 'client'
    this.roomCode = session.code
    this.humans.set(session.localPeerId, { id: session.localPeerId, name: this.localName })
    session.sendToHost({ t: 'hello', name: this.localName, peerId: session.localPeerId })
    return { code: this.roomCode, role: 'client' }
  }

  public stop(): void {
    this.enabled = false
    this.role = 'offline'
    roomDirectory.stopHosting()
    this.session?.destroy()
    this.session = null
    this.humans.clear()
    this.clearNetworkPuppets()
  }

  public noteLocalShot(): void {
    this.pendingShoot = true
  }

  public sendHitToTarget(opts: {
    targetPeerId?: string
    botName?: string
    damage: number
    headshot: boolean
    weapon: string
  }): void {
    if (!this.session || !this.active) return
    const targetId = opts.targetPeerId
      ? `player:${opts.targetPeerId}`
      : opts.botName
        ? `bot:${opts.botName}`
        : ''
    if (!targetId) return
    const msg: NetMsg = {
      t: 'hit',
      targetId,
      damage: opts.damage,
      headshot: opts.headshot,
      attackerName: this.localName,
      weapon: opts.weapon,
    }
    if (this.isHost) this.handleHit(this.session.localPeerId, msg)
    else this.session.sendToHost(msg)
  }

  public update(dt: number): void {
    if (!this.active || !this.session) return
    this.acc += dt
    const step = 1 / MP_TICK_HZ
    if (this.acc < step) return
    this.acc %= step
    this.sendLocalPlayer()
    if (this.isHost) {
      this.sendBots()
      this.reconcileBotCount()
    }
  }

  private onPeerJoined(peerId: string): void {
    if (!this.isHost || !this.session) return
    // Wait for hello to learn name; still reserve roster slot
    if (!this.humans.has(peerId)) {
      this.humans.set(peerId, { id: peerId, name: 'Player' })
    }
  }

  private onPeerLeft(peerId: string): void {
    this.humans.delete(peerId)
    this.removePuppet(`player:${peerId}`)
    if (this.isHost) {
      this.broadcastRoster()
      this.reconcileBotCount()
      roomDirectory.updateHosting(this.humans.size)
    }
  }

  private onMessage(fromId: string, msg: NetMsg): void {
    if (!this.session) return
    switch (msg.t) {
      case 'hello': {
        if (!this.isHost) return
        const known = this.humans.get(fromId)
        this.humans.set(fromId, {
          id: fromId,
          name: msg.name || 'Player',
          team: this.teamPlay ? (known?.team ?? this.balancedTeam()) : undefined,
        })
        this.session.send(fromId, {
          t: 'welcome',
          hostName: this.localName,
          humans: [...this.humans.values()],
          botTarget: botTargetForHumans(this.humans.size, this.fillBots),
          teamMode: this.teamMode,
          mapId: this.mapId,
          teamPlay: this.teamPlay,
          teamSize: this.teamSize,
        })
        this.broadcastRoster()
        this.reconcileBotCount()
        roomDirectory.updateHosting(this.humans.size)
        break
      }
      case 'welcome': {
        const mine = msg.humans.find((h) => h.id === this.session!.localPeerId)
        this.humans.clear()
        for (const h of msg.humans) this.humans.set(h.id, h)
        this.humans.set(this.session.localPeerId, {
          id: this.session.localPeerId,
          name: this.localName,
          team: mine?.team,
        })
        // The host owns the rule set; a joining client adopts it
        this.teamMode = msg.teamMode ?? 'ffa'
        this.mapId = msg.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
        this.teamPlay = !!msg.teamPlay
        this.teamSize = clampTeamSize(msg.teamSize)
        if (mine?.team) this.localTeam = mine.team
        Game.getInstance().setTeamMode(this.teamMode)
        void Game.getInstance()
          .adoptMultiplayerMap(this.mapId)
          .then(() => this.applyTeamState())
        break
      }
      case 'roster': {
        this.teamMode = msg.teamMode ?? this.teamMode
        this.teamPlay = msg.teamPlay ?? this.teamPlay
        this.teamSize = clampTeamSize(msg.teamSize ?? this.teamSize)
        if (msg.mapId === 'de_dust2' || msg.mapId === 'pool_day') {
          this.mapId = msg.mapId
          void Game.getInstance()
            .adoptMultiplayerMap(this.mapId)
            .then(() => this.applyTeamState())
        }
        Game.getInstance().setTeamMode(this.teamMode)
        const keep = new Set(msg.humans.map((h) => h.id))
        this.humans.clear()
        for (const h of msg.humans) this.humans.set(h.id, h)
        const own = this.humans.get(this.session.localPeerId)?.team
        if (own) this.localTeam = own
        this.applyTeamState()
        const game = Game.getInstance()
        for (const bot of [...game.trainingBots]) {
          if (bot.netPeerId && !keep.has(bot.netPeerId) && bot.netPeerId !== this.session.localPeerId) {
            this.removePuppet(`player:${bot.netPeerId}`)
          }
        }
        break
      }
      case 'player': {
        if (msg.id === this.session.localPeerId) return
        this.applyRemotePlayer(msg)
        if (this.isHost) this.session.broadcast(msg, fromId)
        break
      }
      case 'bots': {
        if (this.isHost) return
        this.applyRemoteBots(msg)
        break
      }
      case 'hit': {
        if (this.isHost && fromId !== this.session.localPeerId) {
          this.handleHit(fromId, msg)
        } else if (!this.isHost) {
          this.applyIncomingHit(msg)
        }
        break
      }
      case 'killfeed': {
        // Damage against a human is applied on the victim's client, so this feed is
        // the only signal the shooter gets that the kill actually landed. Without
        // it, kills against real players never reached the local scoreboard.
        if (msg.killer === this.localName && msg.victim !== this.localName) {
          Game.getInstance().onNetworkKill(msg.victim, msg.weapon, msg.headshot)
        } else {
          Game.getInstance().renderer.hud?.pushKillFeed({
            killer: msg.killer,
            victim: msg.victim,
            weaponKey: msg.weapon,
            headshot: msg.headshot,
            isLocal: msg.victim === this.localName,
          })
        }
        if (this.isHost) this.session.broadcast(msg, fromId)
        break
      }
      default:
        break
    }
  }

  private handleHit(fromId: string, msg: Extract<NetMsg, { t: 'hit' }>): void {
    if (!this.session) return
    if (msg.targetId.startsWith('bot:')) {
      const name = msg.targetId.slice(4)
      const game = Game.getInstance()
      const bot = game.trainingBots.find((b) => !b.isNetworkPuppet && b.name === name)
      if (!bot || !bot.isAlive) return
      const part = msg.headshot ? 'head' : 'torso'
      const result = bot.takeDamage(part as any, msg.weapon, true)
      if (result.killed) {
        const feed: NetMsg = {
          t: 'killfeed',
          killer: msg.attackerName,
          victim: bot.name,
          weapon: msg.weapon,
          headshot: msg.headshot,
        }
        this.session.broadcast(feed)
        game.renderer.hud?.pushKillFeed({
          killer: msg.attackerName,
          victim: bot.name,
          weaponKey: msg.weapon,
          headshot: msg.headshot,
          isLocal: msg.attackerName === this.localName,
        })
      }
      return
    }
    if (msg.targetId.startsWith('player:')) {
      const peerId = msg.targetId.slice(7)
      if (peerId === this.session.localPeerId) {
        this.applyIncomingHit(msg)
      } else {
        this.session.send(peerId, msg)
      }
    }
  }

  private applyIncomingHit(msg: Extract<NetMsg, { t: 'hit' }>): void {
    if (!this.session) return
    if (msg.targetId !== `player:${this.session.localPeerId}`) return
    const player = Game.getInstance().currentPlayer?.player
    if (!player || player.isDead) return
    const killed = player.takeDamage(msg.damage, msg.attackerName).killed
    if (killed) {
      const feed: NetMsg = {
        t: 'killfeed',
        killer: msg.attackerName,
        victim: this.localName,
        weapon: msg.weapon,
        headshot: msg.headshot,
      }
      if (this.isHost) {
        this.session.broadcast(feed)
        Game.getInstance().renderer.hud?.pushKillFeed({
          killer: msg.attackerName,
          victim: this.localName,
          weaponKey: msg.weapon,
          headshot: msg.headshot,
          isLocal: true,
        })
      } else {
        this.session.sendToHost(feed)
      }
    }
  }

  private broadcastRoster(): void {
    if (!this.session || !this.isHost) return
    const msg: NetMsg = {
      t: 'roster',
      humans: [...this.humans.values()],
      botTarget: botTargetForHumans(this.humans.size, this.fillBots),
      teamMode: this.teamMode,
      mapId: this.mapId,
      teamPlay: this.teamPlay,
      teamSize: this.teamSize,
    }
    this.session.broadcast(msg)
  }

  /** Side with fewer humans; ties go to the host's opponents so games start even. */
  private balancedTeam(): Team {
    let t = 0
    let ct = 0
    for (const human of this.humans.values()) {
      if (human.team === 'T') t++
      else if (human.team === 'CT') ct++
    }
    if (t === ct) return otherTeam(this.localTeam)
    return t < ct ? 'T' : 'CT'
  }

  /** Push the current team assignment into the game (local side + puppets). */
  private applyTeamState(): void {
    if (!this.teamPlay) return
    const game = Game.getInstance()
    game.enableTeamPlay(this.localTeam, this.teamSize)
    game.setLocalPlayerTeam(this.localTeam)
    for (const bot of game.trainingBots) {
      if (!bot.netPeerId) continue
      const rec = this.humans.get(bot.netPeerId)
      if (rec?.team) bot.team = rec.team
    }
  }

  private sendLocalPlayer(): void {
    if (!this.session) return
    const player = Game.getInstance().currentPlayer?.player
    if (!player) return
    const look = player.lookingDirection
    const yaw = Math.atan2(look.x, look.z)
    const pitch = Math.asin(Math.max(-1, Math.min(1, look.y)))
    const shoot = this.pendingShoot
    this.pendingShoot = false
    // Move intent in the player's own frame so remote clients can play the right
    // strafe / backpedal gait instead of always walking forward.
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    const mz = speed > 0.4 ? (player.velocity.x * sin + player.velocity.z * cos) / speed : 0
    const mx = speed > 0.4 ? (player.velocity.x * cos - player.velocity.z * sin) / speed : 0
    const msg: NetMsg = {
      t: 'player',
      id: this.session.localPeerId,
      name: this.localName,
      x: player.position.x,
      y: player.getFeetY(),
      z: player.position.z,
      yaw,
      pitch,
      hp: player.health,
      armor: player.armor,
      alive: !player.isDead,
      weapon: player.currentWeapon.key,
      moving: player.velocity.length() > 0.4,
      crouch: player.isCrouching,
      shoot: shoot || undefined,
      mx: Math.round(mx * 100) / 100,
      mz: Math.round(mz * 100) / 100,
      air: !player.isOnGround || undefined,
      reload: player.isReloading || undefined,
    }
    if (this.isHost) this.session.broadcast(msg)
    else this.session.sendToHost(msg)
  }

  private sendBots(): void {
    if (!this.session || !this.isHost) return
    const game = Game.getInstance()
    const list = game.trainingBots
      .filter((b) => !b.isNetworkPuppet)
      .map((b) => ({
        name: b.name,
        x: b.position.x,
        y: b.position.y,
        z: b.position.z,
        yaw: b.yaw,
        hp: b.health,
        alive: b.isAlive,
        weapon: b.weaponKey,
        moving: b.isMoving,
        shoot: b.shootFlash > 0.05,
        team: b.team ?? undefined,
      }))
    this.session.broadcast({ t: 'bots', list })
  }

  private applyRemotePlayer(msg: Extract<NetMsg, { t: 'player' }>): void {
    const known = this.humans.get(msg.id)
    this.humans.set(msg.id, { id: msg.id, name: msg.name, team: known?.team })
    const bot = this.ensurePuppet(`player:${msg.id}`, msg.name, msg.id)
    bot.team = known?.team ?? null
    bot.netTX = msg.x
    bot.netTY = msg.y
    bot.netTZ = msg.z
    bot.netTYaw = msg.yaw
    bot.netTPitch = msg.pitch
    bot.hasNetTarget = true
    if (bot.position.y < -20) bot.position.set(msg.x, msg.y, msg.z)
    bot.health = msg.hp
    bot.isAlive = msg.alive
    bot.weaponKey = msg.weapon
    bot.isMoving = msg.moving
    bot.isCrouching = !!msg.crouch
    bot.netMoveX = msg.mx ?? 0
    bot.netMoveZ = msg.mz ?? (msg.moving ? 1 : 0)
    bot.isAirborne = !!msg.air
    bot.isReloadingNet = !!msg.reload
    if (msg.shoot) {
      bot.shootFlash = 0.14
      void Game.getInstance().audioManager.playShot(msg.weapon, {
        x: msg.x,
        y: msg.y + 1.4,
        z: msg.z,
      })
      const cosP = Math.cos(msg.pitch)
      const dir = new Vector3D(Math.sin(msg.yaw) * cosP, Math.sin(msg.pitch), Math.cos(msg.yaw) * cosP)
      Game.getInstance().renderer?.muzzleFlashManager.spawn(
        new Vector3D(msg.x, msg.y + (msg.crouch ? 1.0 : 1.45), msg.z).add(dir.clone().multiplyScalar(0.45)),
        dir
      )
    }
    const idx = Game.getInstance().trainingBots.indexOf(bot)
    const renderer = Game.getInstance().botRenderers[idx]
    renderer?.setWeapon(TrainingBotRenderer.visualWeaponFor(msg.weapon))
  }

  private applyRemoteBots(msg: Extract<NetMsg, { t: 'bots' }>): void {
    const seen = new Set<string>()
    for (const b of msg.list) {
      seen.add(b.name)
      const bot = this.ensurePuppet(`bot:${b.name}`, b.name, undefined)
      bot.netTX = b.x
      bot.netTY = b.y
      bot.netTZ = b.z
      bot.netTYaw = b.yaw
      bot.hasNetTarget = true
      if (bot.position.y < -20) bot.position.set(b.x, b.y, b.z)
      bot.health = b.hp
      bot.isAlive = b.alive
      bot.weaponKey = b.weapon
      bot.isMoving = b.moving
      bot.team = b.team ?? null
      if (b.shoot) bot.shootFlash = 0.12
      const idx = Game.getInstance().trainingBots.indexOf(bot)
      Game.getInstance().botRenderers[idx]?.setWeapon(TrainingBotRenderer.visualWeaponFor(b.weapon))
    }
    const game = Game.getInstance()
    for (const bot of [...game.trainingBots]) {
      if (bot.isNetworkPuppet && !bot.netPeerId && !seen.has(bot.name)) {
        this.removePuppet(`bot:${bot.name}`)
      }
    }
  }

  private ensurePuppet(key: string, name: string, peerId?: string): TrainingBot {
    const game = Game.getInstance()
    const existing = game.trainingBots.find((b) => b.netKey === key)
    if (existing) {
      existing.name = name
      existing.netPeerId = peerId
      return existing
    }
    const bot = new TrainingBot(new Vector3D(0, -50, 0), 0, 'medium', name)
    bot.isNetworkPuppet = true
    bot.netKey = key
    bot.netPeerId = peerId
    bot.aiFrozen = false
    bot.visualModel = 'CsTerrorist'
    bot.weaponKey = 'AK47'
    bot.addToWorld(game.getPhysics())
    const renderer = new TrainingBotRenderer(bot)
    game.trainingBots.push(bot)
    game.botRenderers.push(renderer)
    return bot
  }

  private removePuppet(key: string): void {
    const game = Game.getInstance()
    const idx = game.trainingBots.findIndex((b) => b.netKey === key)
    if (idx < 0) return
    game.trainingBots.splice(idx, 1)
    const ren = game.botRenderers.splice(idx, 1)[0]
    ren?.dispose?.()
  }

  private clearNetworkPuppets(): void {
    const game = Game.getInstance()
    for (let i = game.trainingBots.length - 1; i >= 0; i--) {
      if (!game.trainingBots[i].isNetworkPuppet) continue
      game.trainingBots.splice(i, 1)
      const ren = game.botRenderers.splice(i, 1)[0]
      ren?.dispose?.()
    }
  }

  private reconcileBotCount(): void {
    if (!this.isHost) return
    const game = Game.getInstance()
    if (!game.matchStarted) return
    // Team play sizes the fill to the roster: both sides stay full as humans join
    const desired =
      this.teamPlay && this.fillBots > 0
        ? Math.max(0, this.teamSize * 2 - this.humans.size)
        : botTargetForHumans(this.humans.size, this.fillBots)
    game.reconcileAiBotCount(desired)
  }
}
