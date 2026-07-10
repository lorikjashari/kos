import { Renderer } from './View/Renderer/Renderer'
import { GameObject } from './Core/GameObject'
import { PlayerWrapper } from './Core/PlayerWrapper'
import { IUpdatable } from './Interface/IUpdatable'
import { InputManager } from './Input/InputManager'
import { GlobalLoadingManager } from './View/Mesh/GlobalLoadingManager'
import { Physics } from './Physics/Physics'
import { Vector3D } from './Core/Vector'
import { CubeCollider } from './Physics/Collider/CubeCollider'
import { Actor } from './Core/Actor'
import { CubeRenderer } from './View/Renderer/CubeRenderer'
import { MapMesh } from './View/Mesh/MapMesh'
import { AudioManager } from './View/Audio/AudioManager'
import { BotDifficulty, TrainingBot } from './Core/TrainingBot'
import { TrainingBotRenderer } from './View/Renderer/TrainingBotRenderer'
import { FPSRenderer } from './View/Renderer/PlayerRenderer/FPSRenderer'
import type { BotMatchConfig } from './UI/MainMenu'
import { MatchStats, pickBotNames, type ScoreRow } from './Core/MatchStats'
import {
  MATCH_SPAWNS,
  flatDistXZ,
  shuffleInPlace,
  spawnToBotVector,
  spawnToPlayerVector,
} from './Core/SpawnPoints'

export class Game implements IUpdatable {
  public static game: Game
  public renderer!: Renderer
  public globalLoadingManager: GlobalLoadingManager
  public players: Array<PlayerWrapper>
  public currentPlayer!: PlayerWrapper
  public inputManager: InputManager
  private physics: Physics
  private lastUpdateTS!: number
  public actors!: Array<Actor>
  public audioManager: AudioManager
  public mapName = 'collision-world'
  public trainingBots: TrainingBot[] = []
  public botRenderers: TrainingBotRenderer[] = []
  public matchStarted = false
  public matchPaused = false
  public playerName = 'Player'
  /** When true, killing a bot instantly refills the current mag */
  public refillAmmoOnKill = false
  /** Seconds left in pre-round lockdown (0 = live) */
  public lockdownTimer = 0
  public readonly lockdownDuration = 3
  private pendingBotSpawns: Array<{ pos: Vector3D; yaw: number; difficulty: BotDifficulty; name: string }> = []
  private botSpawnAcc = 0
  private effectsWarmed = false
  private combatLive = false
  public stats = new MatchStats()
  private nameQueue: string[] = []
  private onReturnToMenu: (() => void) | null = null

  constructor() {
    this.players = new Array<PlayerWrapper>()
    this.globalLoadingManager = GlobalLoadingManager.getInstance()
    this.physics = Physics.createDefault()
    this.inputManager = new InputManager()
    this.update = this.update.bind(this)
    this.audioManager = new AudioManager()
  }

  public setReturnToMenuHandler(handler: () => void): void {
    this.onReturnToMenu = handler
  }

  /** Load world + player; bots spawn when match starts from menu */
  public onLoad(): void {
    this.renderer = new Renderer(this.players)
    const playerWrapper = PlayerWrapper.default()
    this.setCurrentPlayer(playerWrapper)
    this.addPlayer(playerWrapper)
    this.setPhysicsObjects()
  }

  public startBotMatch(config: BotMatchConfig): void {
    this.clearBots()
    this.stats.reset()
    this.playerName = config.playerName || 'Player'
    this.refillAmmoOnKill = !!config.refillAmmoOnKill
    this.matchStarted = true
    this.matchPaused = false
    this.combatLive = false
    this.lockdownTimer = this.lockdownDuration
    this.inputManager.gameplayEnabled = true

    // Assign unique spawns: player first, then bots (never same point)
    const assignment = this.assignMatchSpawns(config.botCount)
    if (this.currentPlayer) {
      this.currentPlayer.player.teleportToSpawn(assignment.playerPos)
      this.currentPlayer.player.equipSpawnLoadout()
    }

    this.nameQueue = pickBotNames(config.botCount)
    this.pendingBotSpawns = assignment.botPositions.map((pos, i) => ({
      pos,
      yaw: Math.random() * Math.PI * 2,
      difficulty: config.difficulty,
      name: this.nameQueue[i] || `BOT ${i + 1}`,
    }))
    this.botSpawnAcc = 0
    this.flushPendingBots(2)

    this.renderer.hud?.showGameplay()
    this.renderer.hud?.setLockdown(this.lockdownTimer)
    this.renderer.hud?.setScoreboardVisible(false)
    this.renderer.hud?.setPauseMenuOpen(false)

    // Warm already kicked off from menu click; keep a background pass too
    void this.warmCombatSystems()
    setTimeout(() => this.inputManager.onLock(), 80)
  }

  public pauseMatch(): void {
    if (!this.matchStarted || this.matchPaused) return
    this.matchPaused = true
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.renderer.hud?.setScoreboardVisible(false)
    this.renderer.hud?.setPauseMenuOpen(true)
  }

  public resumeMatch(): void {
    if (!this.matchStarted || !this.matchPaused) return
    this.matchPaused = false
    this.inputManager.gameplayEnabled = true
    this.renderer.hud?.setPauseMenuOpen(false)
    setTimeout(() => this.inputManager.onLock(), 40)
  }

  public returnToMenu(): void {
    this.matchPaused = false
    this.matchStarted = false
    this.combatLive = false
    this.lockdownTimer = 0
    this.clearBots()
    this.stats.reset()
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.renderer.hud?.setPauseMenuOpen(false)
    this.renderer.hud?.setLockdown(null)
    this.renderer.hud?.setScoreboardVisible(false)
    const hudRoot = document.getElementById('game-hud')
    if (hudRoot) hudRoot.style.display = 'none'
    document.getElementById('game-crosshair')?.classList.remove('is-on')
    this.onReturnToMenu?.()
  }

  /**
   * Pick unique spawn points from MATCH_SPAWNS.
   * Player gets one; bots get others — never the same coordinate.
   */
  private assignMatchSpawns(botCount: number): { playerPos: Vector3D; botPositions: Vector3D[] } {
    const indices = shuffleInPlace([...MATCH_SPAWNS.keys()])
    const playerIdx = indices[0]
    const playerPos = spawnToPlayerVector(MATCH_SPAWNS[playerIdx])

    const used = new Set<number>([playerIdx])
    const botPositions: Vector3D[] = []
    const need = Math.min(botCount, MATCH_SPAWNS.length - 1)

    for (const idx of indices) {
      if (botPositions.length >= need) break
      if (used.has(idx)) continue
      used.add(idx)
      botPositions.push(spawnToBotVector(MATCH_SPAWNS[idx]))
    }
    return { playerPos, botPositions }
  }

  /**
   * Respawn: pick a free spawn far from everyone currently alive.
   * Never reuse a point another bot/player is standing on.
   */
  /**
   * Respawn: pick a free spawn far from everyone currently alive.
   * @param forBot — bots use ground Y; player uses capsule Y from the list
   */
  public pickRespawnPosition(preferAwayFrom?: Vector3D, forBot = false): Vector3D {
    const occupied: Array<{ x: number; z: number }> = []
    const player = this.currentPlayer?.player
    if (player && !player.isDead) {
      occupied.push({ x: player.position.x, z: player.position.z })
    }
    for (const bot of this.trainingBots) {
      if (!bot.isAlive) continue
      occupied.push({ x: bot.position.x, z: bot.position.z })
    }

    const minClear = 8
    type Ranked = { idx: number; score: number }
    const ranked: Ranked[] = []

    for (let i = 0; i < MATCH_SPAWNS.length; i++) {
      const s = MATCH_SPAWNS[i]
      let nearest = Infinity
      for (const o of occupied) {
        nearest = Math.min(nearest, flatDistXZ(s.x, s.z, o.x, o.z))
      }
      let score = nearest
      if (preferAwayFrom) {
        score += flatDistXZ(s.x, s.z, preferAwayFrom.x, preferAwayFrom.z) * 0.15
      }
      ranked.push({ idx: i, score })
    }

    ranked.sort((a, b) => b.score - a.score)
    const clear = ranked.find((r) => {
      const s = MATCH_SPAWNS[r.idx]
      return occupied.every((o) => flatDistXZ(s.x, s.z, o.x, o.z) >= minClear)
    })
    const pick = clear ?? ranked[0]
    const s = MATCH_SPAWNS[pick.idx]
    return forBot ? spawnToBotVector(s) : spawnToPlayerVector(s)
  }

  public getScoreboardRows(): ScoreRow[] {
    const rows: ScoreRow[] = [
      {
        name: this.playerName || 'Player',
        kills: this.stats.kills,
        deaths: this.stats.deaths,
        assists: this.stats.assists,
        isYou: true,
      },
    ]
    for (const bot of this.trainingBots) {
      rows.push({
        name: bot.name,
        kills: bot.kills,
        deaths: bot.deaths,
        assists: bot.assists,
        isYou: false,
      })
    }
    rows.sort((a, b) => b.kills - a.kills || b.assists - a.assists || a.deaths - b.deaths)
    return rows
  }

  public isCombatLive(): boolean {
    return this.matchStarted && this.combatLive && this.lockdownTimer <= 0
  }

  public async prepareCombat(): Promise<void> {
    await this.warmCombatSystems()
  }

  private async warmCombatSystems(): Promise<void> {
    try {
      await this.audioManager.unlock()
      await this.audioManager.warmPlayback()

      const renderer = this.renderer
      const camera = renderer.camera
      const fpsRenderer = this.currentPlayer?.renderer as FPSRenderer | undefined

      // Wait for muzzle texture so compile actually uploads it
      await renderer.muzzleFlashManager.whenReady()
      await new Promise<void>((r) => requestAnimationFrame(() => r()))

      // Pre-init every gun + compile viewmodel shaders (biggest switch hitch)
      fpsRenderer?.warmWeapons(renderer)
      await Promise.all([
        fpsRenderer?.warmShellParticles() ?? Promise.resolve(),
        renderer.particleManager.whenReady(),
      ])

      renderer.projectileManager.warm(renderer, camera)
      renderer.muzzleFlashManager.warm(renderer, camera)
      renderer.bloodManager.warm(renderer, camera)
      renderer.bulletHoleManager.warm(renderer, camera)
      renderer.hud?.warmWeaponIcons()

      // Live off-screen spawn once so first real shot/hit uses hot paths
      const off = new Vector3D(0, -500, 0)
      const dir = new Vector3D(0, 0, -1)
      renderer.muzzleFlashManager.spawn(off, dir)
      renderer.projectileManager.spawn(off, dir, undefined, 50)
      renderer.bloodManager.spawn(off, new Vector3D(0, 1, 0), 'body')
      renderer.bloodManager.spawn(off, new Vector3D(0, 1, 0), 'head')
      renderer.bloodManager.spawn(off, new Vector3D(0, 1, 0), 'legs')
      renderer.bulletHoleManager.spawn(off, new Vector3D(0, 1, 0))

      // Force a compile + one render of warm objects
      renderer.compile(renderer.scene, camera)
      renderer.render(renderer.scene, camera)

      this.effectsWarmed = true
    } catch (e) {
      console.warn('[warm]', e)
      this.effectsWarmed = true
    }
  }

  private flushPendingBots(maxThisFrame: number): void {
    let n = 0
    while (n < maxThisFrame && this.pendingBotSpawns.length > 0) {
      const p = this.pendingBotSpawns.shift()!
      const bot = new TrainingBot(p.pos, p.yaw, p.difficulty, p.name)
      bot.addToWorld(this.physics)
      const renderer = new TrainingBotRenderer(bot)
      this.trainingBots.push(bot)
      this.botRenderers.push(renderer)
      n++
    }
  }

  /** Player got the kill */
  public onPlayerKill(victim: TrainingBot, weaponKey: string, headshot: boolean): void {
    this.stats.kills++
    // Assist credit for bots that damaged the victim
    for (const name of victim.damagers) {
      if (name === this.playerName) continue
      const helper = this.trainingBots.find((b) => b.name === name)
      if (helper) helper.assists++
    }
    this.renderer.hud?.pushKillFeed({
      killer: this.playerName,
      victim: victim.name,
      weaponKey,
      headshot,
      isLocal: true,
    })
  }

  /** Bot killed another bot — always track K; show feed only if you assisted */
  public onBotKilledByBot(killer: TrainingBot, victim: TrainingBot): void {
    const playerName = this.playerName || 'Player'
    const assisted = victim.playerDamageDealt >= 20 || victim.damagers.has(playerName)
    if (assisted) {
      this.stats.assists++
      this.renderer.hud?.pushKillFeed({
        killer: killer.name,
        victim: victim.name,
        weaponKey: killer.weaponKey,
        headshot: false,
        assist: playerName,
        isLocal: true,
      })
    }
    // Other damagers (bots) get assist credit
    for (const name of victim.damagers) {
      if (name === killer.name || name === playerName) continue
      const helper = this.trainingBots.find((b) => b.name === name)
      if (helper) helper.assists++
    }
  }

  public onPlayerDeath(): void {
    this.stats.deaths++
  }

  public clearBots(): void {
    for (const r of this.botRenderers) {
      const root = r.getRoot()
      root.parent?.remove(root)
    }
    this.trainingBots = []
    this.botRenderers = []
    this.pendingBotSpawns = []
  }

  public spawnTrainingBots(count: number, difficulty: BotDifficulty): void {
    const assignment = this.assignMatchSpawns(count)
    const names = pickBotNames(count)
    for (let i = 0; i < assignment.botPositions.length; i++) {
      const pos = assignment.botPositions[i]
      const bot = new TrainingBot(pos, Math.random() * Math.PI * 2, difficulty, names[i] || `BOT ${i + 1}`)
      bot.addToWorld(this.physics)
      const renderer = new TrainingBotRenderer(bot)
      this.trainingBots.push(bot)
      this.botRenderers.push(renderer)
    }
  }

  public setPhysicsObjects(): void {
    this.actors = new Array<CubeCollider>()

    for (let j = 1; j < 10; j++) {
      const cube = new CubeRenderer(new Vector3D(10 + j * 2.5, 5, 46), new Vector3D(0, 0, 0), new Vector3D(2, 2, 2), 25)
      this.actors.push(cube)
      cube.addToWorld(this.physics)
      this.addToRenderer(cube.mesh)
    }

    const mapMesh = this.globalLoadingManager.loadableMeshs.get('Map') as MapMesh | undefined
    if (!mapMesh) {
      throw new Error('Map mesh failed to load. Check that pool_day_baked.glb exists in public/.')
    }
    mapMesh.init()
    mapMesh.addPhysics(this)
    this.addToRenderer(mapMesh.mesh)
  }
  public static getInstance(): Game {
    if (!Game.game) {
      Game.game = new Game()
    }
    return Game.game
  }
  public addToRenderer(gameObject: GameObject) {
    this.renderer.scene.add(gameObject)
  }
  public addToWorld(actor: Actor) {
    if (actor.body) {
      this.physics.add(actor.body)
    } else {
      throw new Error("This actor doesn't have a body!")
    }
  }
  public setCurrentPlayer(player: PlayerWrapper) {
    if (!this.renderer) {
      throw new Error('No renderer!')
    }
    if (this.currentPlayer) {
      this.currentPlayer.player.isCurrentPlayer = false
    }
    this.currentPlayer = player
    this.currentPlayer.player.isCurrentPlayer = true
    this.renderer.setCurrentPlayer(this.currentPlayer)
    this.inputManager.setCurrentPlayer(this.currentPlayer)
  }
  public update() {
    const now: number = performance.now()
    let dt = (now - this.lastUpdateTS) / 1000
    dt = Math.min(20 / 1000, dt)
    this.currentPlayer.player.prestep(dt)

    if (this.matchStarted) {
      if (this.matchPaused) {
        this.renderer.update(0)
        this.lastUpdateTS = now
        requestAnimationFrame(this.update)
        return
      }

      // Stagger bot mesh creation across lockdown frames
      if (this.pendingBotSpawns.length > 0) {
        this.botSpawnAcc += dt
        // ~8 bots/sec during lockdown, burst a few each frame
        const budget = Math.max(1, Math.floor(this.botSpawnAcc * 10))
        this.botSpawnAcc = 0
        this.flushPendingBots(Math.min(3, budget))
      }

      if (this.lockdownTimer > 0) {
        this.lockdownTimer = Math.max(0, this.lockdownTimer - dt)
        this.renderer.hud?.setLockdown(this.lockdownTimer > 0 ? this.lockdownTimer : null)
        if (this.lockdownTimer <= 0) {
          this.combatLive = true
          this.renderer.hud?.setLockdown(null)
          // Finish any leftover spawns quickly once live
          this.flushPendingBots(8)
        }
      }

      const botsActive = this.combatLive
      for (let i = 0; i < this.trainingBots.length; i++) {
        if (botsActive) this.trainingBots[i].update(dt)
        this.botRenderers[i]?.update(dt)
      }
    }

    this.inputManager.update(dt)

    for (let i = 0; i < this.actors.length; i++) {
      this.actors[i].update(dt)
    }

    this.currentPlayer.player.update(dt)
    this.currentPlayer.player.updateDeath(dt)
    this.physics.update(dt)
    this.renderer.update(dt)
    this.lastUpdateTS = now
    requestAnimationFrame(this.update)
  }
  public startUpdateLoop() {
    this.lastUpdateTS = performance.now()
    this.update()
  }
  public addPlayer(playerWrapper: PlayerWrapper) {
    this.players.push(playerWrapper)
    playerWrapper.player.addToWorld(this.physics)
  }

  public getPhysics(): Physics {
    return this.physics
  }
}
