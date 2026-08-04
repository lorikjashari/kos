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
import {
  CareerStats,
  DEFAULT_MATCH_LENGTH,
  MatchStats,
  pickBotNames,
  rulesForLength,
  type MatchEndReason,
  type MatchResult,
  type MatchRules,
  type ScoreRow,
  type TeamMode,
} from './Core/MatchStats'
import * as THREE from 'three'
import {
  BOT_GROUND_Y,
  DEFAULT_MAP_ID,
  deriveSpawnsFromGeometry,
  getMapDefinition,
  mapSupportsTeams,
  spawnsFromBounds,
  type MapId,
  type ProbeFn,
  type SpawnPoint,
} from './Core/MapCatalog'
import { clampTeamSize, DEFAULT_TEAM_SIZE, otherTeam, TEAM_COLOR, type Team } from './Core/Teams'
import {
  flatDistXZ,
  shuffleInPlace,
  spawnToBotVector,
  spawnToPlayerVector,
} from './Core/SpawnPoints'
import { CommandConsole } from './UI/CommandConsole'
import { PerfOverlay } from './UI/PerfOverlay'
import { EditorMenu, type EditorTool } from './UI/EditorMenu'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { CrosshairRenderer } from './UI/CrosshairRenderer'
import type { PlayerSettings } from './UI/SettingsStore'
import {
  clampSensitivity,
  clampVolume,
  clampZoomSensitivity,
  loadSettings,
  normalizeResolution,
  saveSettings,
} from './UI/SettingsStore'
import { CameraManager } from './View/CameraManager/CameraManager'
import type { MobileControls } from './UI/MobileControls'
import { isTouchDevice } from './UI/MobileDevice'
import { MultiplayerMatch, type MultiplayerStartConfig } from './Net/MultiplayerMatch'
import { botTargetForHumans } from './Net/NetTypes'
import type { MobilePerfProfile, MobileResMode } from './UI/SettingsStore'

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
  public mapName = 'pool_day'
  public activeMapId: MapId = DEFAULT_MAP_ID
  private activeSpawns: ReadonlyArray<SpawnPoint> = getMapDefinition(DEFAULT_MAP_ID).spawns
  private mapExtras: THREE.Object3D[] = []
  private mapColliders: Actor[] = []
  private activeMapMesh: MapMesh | null = null
  /** Bumps to cancel stale menu prefetches when the selection changes. */
  private mapPrefetchGen = 0
  private debugPropMeshes: THREE.Object3D[] = []
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
  private pendingBotSpawns: Array<{
    pos: Vector3D
    yaw: number
    difficulty: BotDifficulty
    name: string
    team: Team | null
  }> = []
  private botSpawnAcc = 0
  private effectsWarmed = false
  private graphicsWarmed = false
  private audioWarmed = false
  private combatLive = false
  /** Waiting for AWP+USP / AK+USP pick before lockdown */
  private awaitingLoadout = false
  public stats = new MatchStats()
  private matchRules: MatchRules = rulesForLength(DEFAULT_MATCH_LENGTH)
  private matchElapsed = 0
  /** Set once the win condition fires; freezes combat until rematch or menu */
  private matchOver = false
  private teamMode: TeamMode = 'ffa'
  /** Team deathmatch (T vs CT). Only maps with authored side spawns can run it. */
  private teamPlay = false
  private playerTeam: Team = 'CT'
  private teamSize = DEFAULT_TEAM_SIZE
  private teamScores: Record<Team, number> = { T: 0, CT: 0 }
  private nameQueue: string[] = []
  private onReturnToMenu: (() => void) | null = null
  private onHideMenu: (() => void) | null = null
  private commandConsole: CommandConsole | null = null
  private consoleResumeGameplay = false
  private perfOverlay: PerfOverlay | null = null
  private crosshairRenderer: CrosshairRenderer | null = null
  private crosshairSettings: PlayerSettings['crosshair'] | null = null
  private playerSettings: PlayerSettings | null = null
  private lastMatchConfig: BotMatchConfig | null = null
  public multiplayer: MultiplayerMatch | null = null
  private mpBanner: HTMLElement | null = null
  /** Generic CS-style cvar store for values with no local system yet. */
  private cvars = new Map<string, string>()
  /** 0 = uncapped (follows display, including 120Hz ProMotion); else hard cap. */
  private fpsCap = 0
  private lastFrameTS = 0
  /** Real time elapsed since the last drawn frame — kept so a capped frame rate
   * still animates at real speed instead of losing the skipped frames' time. */
  private renderAcc = 0
  private displayHz = 60
  /** /editormode sandbox */
  public editorActive = false
  private editorMenu: EditorMenu | null = null
  private transformControls: TransformControls | null = null
  private editorTool: EditorTool = 'translate'
  private editorXray = false
  private editorWireframe = false
  private editorAxes = true
  private editorHitZonesOnly = false
  private editorFpsLook = false
  private editorDragging = false
  private editorPreviewAnim = 'Idle'
  private editorWeapon = 'Usp'
  /** '' = gizmo moves the whole bot; otherwise a bone key being posed */
  private editorBoneKey = ''
  private boundEditorKeys: ((e: KeyboardEvent) => void) | null = null
  private mobileControls: MobileControls | null = null

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

  public setHideMenuHandler(handler: () => void): void {
    this.onHideMenu = handler
  }

  public isCommandConsoleOpen(): boolean {
    return !!this.commandConsole?.isOpen()
  }

  /** Known console commands for CS-style autocomplete. */
  public static readonly CONSOLE_COMMANDS: string[] = [
    'help',
    'cmdlist',
    'clear',
    'cls',
    'echo',
    'toggleconsole',
    'crosshair',
    'cl_crosshair_size',
    'cl_crosshair_color',
    'cl_dynamiccrosshair',
    'cl_observercrosshair',
    'cl_showfps',
    'net_graph',
    'net_graphpos',
    'net_graphwidth',
    'volume',
    'mp3volume',
    'bgmvolume',
    'sensitivity',
    'sens',
    'zoom_sensitivity',
    'zoom_sensitivity_ratio',
    'fps_max',
    'fps_override',
    'rate',
    'cl_cmdrate',
    'cl_updaterate',
    'ex_interp',
    'cl_lc',
    'cl_lw',
    'voice_enable',
    'voice_scale',
    'hisound',
    'suitvolume',
    'disconnect',
    'retry',
    'reconnect',
    'connect',
  ]

  /** Press ` (backtick) in-game or on the menu to open the CS-style console. */
  public openCommandConsole(): void {
    if (!this.commandConsole) {
      this.commandConsole = new CommandConsole({
        onCommand: (line) => void this.runCommand(line),
        onClose: () => this.onCommandConsoleClosed(),
        commands: Game.CONSOLE_COMMANDS,
      })
    } else {
      this.commandConsole.setCommands(Game.CONSOLE_COMMANDS)
    }
    if (this.commandConsole.isOpen()) return
    this.consoleResumeGameplay = this.matchStarted && !this.matchPaused && this.inputManager.gameplayEnabled
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.syncMobileControls()
    this.commandConsole.show()
  }

  /** Backtick toggles the console open/closed. */
  public toggleCommandConsole(): void {
    if (this.isCommandConsoleOpen()) {
      this.commandConsole?.close()
    } else {
      this.openCommandConsole()
    }
  }

  private onCommandConsoleClosed(): void {
    if (this.consoleResumeGameplay && this.matchStarted && !this.matchPaused) {
      this.inputManager.gameplayEnabled = true
      this.syncMobileControls()
      setTimeout(() => this.inputManager.onLock(), 40)
    }
    this.consoleResumeGameplay = false
  }

  /** Wire the in-game crosshair + live settings so the console can tweak them. */
  public attachCrosshair(renderer: CrosshairRenderer, settings: PlayerSettings): void {
    this.crosshairRenderer = renderer
    this.crosshairSettings = settings.crosshair
    this.playerSettings = settings
    this.applyPersistedSettings(settings)
  }

  public getCrosshairRenderer(): CrosshairRenderer | null {
    return this.crosshairRenderer
  }

  /** Apply saved console/settings values (sens, zoom sens, volumes, fps_max). */
  public applyPersistedSettings(settings?: PlayerSettings): void {
    const s = settings ?? loadSettings()
    this.playerSettings = s
    this.inputManager.setSensitivity(s.sensitivity)
    CameraManager.zoomSensitivity = clampZoomSensitivity(s.zoomSensitivity)
    this.audioManager.setSfxVolume(clampVolume(s.volume))
    this.audioManager.setMusicVolume(clampVolume(s.musicVolume))
    this.setFpsCap(s.fpsMax === 999 ? 0 : s.fpsMax)
    if (isTouchDevice()) {
      this.mobileControls?.applySettings(s.mobile)
      this.applyMobileResMode(s.mobile.resMode)
      this.applyMobilePerfProfile(s.mobile.perfProfile)
    } else {
      this.applyResolution(s.resolutionWidth, s.resolutionHeight)
      this.applyGraphicsQuality(s.graphicsQuality || 'high')
      this.mobileControls?.applySettings(s.mobile)
    }
    this.syncMobileControls()
  }

  public applyGraphicsQuality(quality: 'low' | 'medium' | 'high'): void {
    if (isTouchDevice()) return
    this.renderer?.applyGraphicsProfile(quality)
  }

  public applyMobilePerfProfile(profile: MobilePerfProfile): void {
    if (!isTouchDevice()) return
    this.renderer?.applyMobilePerfProfile(profile)
  }

  /** Mobile render aspect: `normal` = the screen's own aspect, `4:3` = stretched 4:3. */
  public applyMobileResMode(mode: MobileResMode): void {
    if (!isTouchDevice()) return
    this.renderer?.setMobileResMode(mode)
  }

  /** Apply internal render resolution from settings (persists when saved via menu). */
  public applyResolution(width: number, height: number): void {
    const normalized = normalizeResolution(width, height)
    this.renderer?.setGameResolution(normalized.width, normalized.height)
  }

  private persistSettingsPatch(patch: Partial<PlayerSettings>): void {
    const stored = loadSettings()
    Object.assign(stored, patch)
    if (this.playerSettings) Object.assign(this.playerSettings, patch)
    saveSettings(stored)
  }

  /** Apply mouse look sensitivity (settings + console). Persists to localStorage. */
  public setSensitivity(value: number): number {
    const s = clampSensitivity(value)
    this.inputManager.setSensitivity(s)
    this.persistSettingsPatch({ sensitivity: s })
    return s
  }

  /** Scoped sensitivity ratio (console: zoom_sensitivity). Persists. */
  public setZoomSensitivity(value: number): number {
    const z = clampZoomSensitivity(value)
    CameraManager.zoomSensitivity = z
    this.persistSettingsPatch({ zoomSensitivity: z })
    return z
  }

  private conPrint(msg: string, kind: '' | 'echo' | 'warn' | 'ok' = ''): void {
    this.commandConsole?.print(msg, kind)
  }

  /** Split a command line into tokens, honouring "quoted strings". */
  private tokenize(line: string): string[] {
    const out: string[] = []
    const re = /"([^"]*)"|(\S+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) out.push(m[1] ?? m[2] ?? '')
    return out
  }

  private toNum(v: string | undefined, fallback = 0): number {
    if (v === undefined) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  private ensurePerfOverlay(): PerfOverlay {
    if (!this.perfOverlay) this.perfOverlay = new PerfOverlay()
    return this.perfOverlay
  }

  public setDisplayRefreshRate(hz: number): void {
    this.displayHz = Math.max(30, Math.min(240, Math.round(hz) || 60))
  }

  public getDisplayRefreshRate(): number {
    return this.displayHz
  }

  /**
   * fps_max: 0 = uncapped (matches display refresh — 120 on ProMotion iOS),
   * 1..24 clamp up to 24, 25..999 use that exact cap.
   */
  public setFpsCap(n: number): number {
    if (n <= 0) this.fpsCap = 0
    else if (n <= 24) this.fpsCap = 24
    else this.fpsCap = Math.min(999, Math.floor(n))
    return this.fpsCap
  }

  private applyCrosshair(): void {
    if (this.crosshairRenderer && this.crosshairSettings) {
      this.crosshairRenderer.setSettings(this.crosshairSettings)
    }
  }

  private async runCommand(line: string): Promise<void> {
    const args = this.tokenize(line)
    if (args.length === 0) return
    const cmd = (args[0] ?? '').toLowerCase()
    const arg1 = args[1]
    const val = this.toNum(arg1, 0)
    const onOff = (n: number) => (n ? 'on' : 'off')

    switch (cmd) {
      // ---- Console / engine ----
      case 'editormode':
        this.consoleResumeGameplay = false
        this.conPrint('Entering editor sandbox...', 'ok')
        await this.enterEditorMode()
        return
      case 'toggleconsole':
        this.commandConsole?.close()
        return
      case 'clear':
      case 'cls':
        this.commandConsole?.clear()
        return
      case 'echo':
        this.conPrint(args.slice(1).join(' '))
        return
      case 'help':
      case 'cmdlist':
        this.conPrint('Commands: crosshair, cl_crosshair_size, cl_crosshair_color,')
        this.conPrint('  cl_showfps, net_graph, volume, MP3Volume, bgmvolume, fps_max,')
        this.conPrint('  sensitivity, zoom_sensitivity, disconnect, retry, reconnect,')
        this.conPrint('  connect, toggleconsole, clear')
        this.conPrint('Tip: type a few letters — matches show under the input. Tab / ↓ fills.')
        return

      // ---- FPS / perf ----
      case 'cl_showfps':
        this.ensurePerfOverlay().setShowFps(val > 0)
        this.conPrint(`cl_showfps ${onOff(val)}`, 'ok')
        return
      case 'net_graph':
        this.ensurePerfOverlay().setNetGraph(val)
        this.conPrint(`net_graph ${Math.max(0, Math.min(3, Math.floor(val)))}`, 'ok')
        return
      case 'net_graphpos':
        this.ensurePerfOverlay().setPos(val)
        this.cvars.set(cmd, arg1 ?? '')
        this.conPrint(`net_graphpos ${val}`, 'ok')
        return
      case 'net_graphwidth':
        this.ensurePerfOverlay().setWidth(val)
        this.cvars.set(cmd, arg1 ?? '')
        this.conPrint(`net_graphwidth ${val}`, 'ok')
        return

      // ---- Crosshair ----
      case 'crosshair': {
        const canvas = document.getElementById('game-crosshair') as HTMLElement | null
        if (canvas) canvas.style.display = val > 0 ? '' : 'none'
        this.conPrint(`crosshair ${onOff(val)}`, 'ok')
        return
      }
      case 'cl_crosshair_size': {
        if (!this.crosshairSettings) return this.conPrint('crosshair not ready', 'warn')
        const map: Record<string, number> = { small: 2, medium: 4, large: 6 }
        const size = map[(arg1 ?? '').toLowerCase()] ?? this.toNum(arg1, this.crosshairSettings.size)
        this.crosshairSettings.size = size
        this.applyCrosshair()
        this.conPrint(`cl_crosshair_size ${arg1 ?? size}`, 'ok')
        return
      }
      case 'cl_crosshair_color': {
        if (!this.crosshairSettings) return this.conPrint('crosshair not ready', 'warn')
        const parts = (args.slice(1).join(' ').match(/\d+/g) ?? []).map(Number)
        if (parts.length >= 3) {
          this.crosshairSettings.colorR = parts[0]
          this.crosshairSettings.colorG = parts[1]
          this.crosshairSettings.colorB = parts[2]
          this.applyCrosshair()
          this.conPrint(`cl_crosshair_color "${parts[0]} ${parts[1]} ${parts[2]}"`, 'ok')
        } else {
          this.conPrint('usage: cl_crosshair_color "R G B"', 'warn')
        }
        return
      }
      case 'cl_dynamiccrosshair':
      case 'cl_observercrosshair':
        this.cvars.set(cmd, arg1 ?? '')
        this.conPrint(`${cmd} ${onOff(val)}`, 'ok')
        return

      // ---- Mouse ----
      case 'sensitivity':
      case 'sens': {
        if (arg1 === undefined) {
          this.conPrint(`"sensitivity" is "${this.inputManager.getSensitivity()}"`)
          return
        }
        const s = this.setSensitivity(val)
        this.conPrint(`sensitivity ${s}`, 'ok')
        return
      }
      case 'zoom_sensitivity':
      case 'zoom_sensitivity_ratio': {
        if (arg1 === undefined) {
          this.conPrint(`"zoom_sensitivity" is "${CameraManager.zoomSensitivity}"`)
          return
        }
        const z = this.setZoomSensitivity(val)
        this.conPrint(`zoom_sensitivity ${z}`, 'ok')
        return
      }

      // ---- Volume (persisted across refresh) ----
      case 'volume': {
        if (arg1 === undefined) {
          this.conPrint(`"volume" is "${this.audioManager.getSfxVolume().toFixed(2)}"`)
          return
        }
        const v = clampVolume(val)
        this.audioManager.setSfxVolume(v)
        this.persistSettingsPatch({ volume: v })
        this.conPrint(`volume ${v.toFixed(2)}`, 'ok')
        return
      }
      case 'mp3volume':
      case 'bgmvolume': {
        if (arg1 === undefined) {
          this.conPrint(`"${cmd}" is "${this.audioManager.getMusicVolume().toFixed(2)}"`)
          return
        }
        const v = clampVolume(val)
        this.audioManager.setMusicVolume(v)
        this.persistSettingsPatch({ musicVolume: v })
        this.conPrint(`${cmd} ${v.toFixed(2)}`, 'ok')
        return
      }
      case 'voice_enable':
      case 'voice_scale':
      case 'hisound':
      case 'suitvolume':
        this.cvars.set(cmd, arg1 ?? '')
        this.conPrint(`${cmd} ${arg1 ?? ''}`.trim(), 'ok')
        return

      // ---- Connection ----
      case 'disconnect':
        this.conPrint('Disconnecting...', 'ok')
        this.returnToMenu()
        return
      case 'retry':
      case 'reconnect':
        if (this.lastMatchConfig) {
          this.consoleResumeGameplay = false
          this.commandConsole?.close()
          this.conPrint('Reconnecting...', 'ok')
          this.startBotMatch(this.lastMatchConfig)
        } else {
          this.conPrint('No previous session to reconnect to.', 'warn')
        }
        return
      case 'connect':
        this.conPrint(
          arg1 ? `connect ${arg1}: online play is not available (local match only).` : 'usage: connect <ip:port>',
          'warn',
        )
        return

      // ---- FPS cap (persisted) ----
      case 'fps_max': {
        if (arg1 === undefined) {
          this.conPrint(`"fps_max" is "${this.fpsCap}" (display ~${this.displayHz}Hz)`)
          return
        }
        const cap = this.setFpsCap(val)
        this.persistSettingsPatch({ fpsMax: cap })
        this.conPrint(
          cap === 0
            ? `fps_max 0 (unlimited / ~${this.displayHz}Hz display)`
            : `fps_max ${cap}`,
          'ok'
        )
        return
      }

      // ---- Netcode cvars (stored, no local effect) ----
      case 'fps_override':
      case 'rate':
      case 'cl_cmdrate':
      case 'cl_updaterate':
      case 'ex_interp':
      case 'cl_lc':
      case 'cl_lw':
        this.cvars.set(cmd, arg1 ?? '')
        this.conPrint(`${cmd} ${arg1 ?? ''}`.trim(), 'ok')
        return

      default:
        // Unknown token: if it looks like "name value", store it as a cvar.
        if (arg1 !== undefined) {
          this.cvars.set(cmd, arg1)
          this.conPrint(`${cmd} set to "${arg1}"`)
        } else {
          this.conPrint(`Unknown command: ${cmd}`, 'warn')
        }
        return
    }
  }

  public isEditorTransformDragging(): boolean {
    return this.editorActive && this.editorDragging
  }

  public isEditorMenuOpen(): boolean {
    return !!this.editorMenu?.isOpen()
  }

  /**
   * Editor sandbox: Pool Day, one frozen bot in front of you (no AI / no shooting).
   */
  public async enterEditorMode(): Promise<void> {
    this.onHideMenu?.()
    await this.ensureMap('pool_day')
    await this.prepareCombat()
    // CS Source T model for the frozen editor dummy
    await this.globalLoadingManager.ensureMesh('CsTerrorist', 'models/cs_terrorist.glb')
    // Editor AK: same AKM as main game (already loaded as AK47). AkmRaw for third-person.
    await this.globalLoadingManager.ensureMesh(
      'AkmRaw',
      'models/akm_assault_rifle_animated.glb'
    )
    await this.globalLoadingManager.ensureFpsMesh(
      'AK47',
      'models/akm_assault_rifle_animated.glb',
      new Vector3D(0.2, -0.25, -0.16),
      false
    )
    this.teardownEditorTools()
    this.clearBots()
    this.stats.reset()
    this.playerName = this.playerName || 'Player'
    this.refillAmmoOnKill = false
    this.matchStarted = true
    this.matchPaused = false
    this.combatLive = true
    this.lockdownTimer = 0
    this.pendingBotSpawns = []
    this.editorActive = true
    this.editorFpsLook = false
    this.editorTool = 'translate'
    this.editorXray = false
    this.editorWireframe = false
    this.editorAxes = true
    this.editorHitZonesOnly = false
    this.editorPreviewAnim = 'Idle'
    this.editorWeapon = 'AK'
    TrainingBot.showHitboxes = false
    // Cursor free so the editor panel + gizmo work
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.applyMapMoveSpeed('pool_day')

    const spawn = spawnToPlayerVector(this.activeSpawns[0] ?? { x: 18.9, y: 2, z: 29.7 })
    const player = this.currentPlayer.player
    player.teleportToSpawn(spawn)
    player.equipSpawnLoadout()

    // Stand on the deck facing each other (not out in the pool)
    const forward = new THREE.Vector3(0, 0, -1)
    const cam = this.currentPlayer.cameraManager?.camera
    if (cam) forward.applyQuaternion(cam.quaternion)
    forward.y = 0
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1)
    else forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const standOff = 3.2
    const side = 0.4
    let botX = player.position.x + forward.x * standOff + right.x * side
    let botZ = player.position.z + forward.z * standOff + right.z * side
    let botY = BOT_GROUND_Y

    const hit = this.physics.raycast(
      new Vector3D(botX, player.position.y + 4, botZ),
      new Vector3D(botX, player.position.y - 8, botZ)
    )
    if (hit?.hasHit && hit.hitPosition) {
      botY = hit.hitPosition.y
    }

    const botPos = new Vector3D(botX, botY, botZ)
    const yawFacingPlayer = Math.atan2(player.position.x - botPos.x, player.position.z - botPos.z)
    const bot = new TrainingBot(botPos, yawFacingPlayer, 'medium', 'EDITOR')
    bot.aiFrozen = true
    bot.lookAtPlayer = true
    bot.visualScale = 1
    bot.visualModel = 'CsTerrorist'
    bot.editorHome = {
      x: botPos.x,
      y: botPos.y,
      z: botPos.z,
      yaw: yawFacingPlayer,
      scale: 1,
    }
    bot.addToWorld(this.physics)
    const renderer = new TrainingBotRenderer(bot)
    this.trainingBots.push(bot)
    this.botRenderers.push(renderer)
    renderer.setAxesVisible(true)
    // Default Idle on the CS terrorist (not the robot avatar)
    renderer.previewAnim(this.editorPreviewAnim)
    renderer.setWeapon('AK')

    this.renderer.hud?.showGameplay()
    this.renderer.hud?.setLockdown(null)
    this.renderer.hud?.setScoreboardVisible(false)
    this.renderer.hud?.setPauseMenuOpen(false)

    this.editorBoneKey = ''
    this.setupEditorTools(renderer.getRoot())
    const menu = this.ensureEditorMenu()
    menu.setBones(renderer.getEditableBones())
    menu.show()
  }

  private ensureEditorMenu(): EditorMenu {
    if (this.editorMenu) return this.editorMenu
    this.editorMenu = new EditorMenu({
      onTool: (tool) => this.setEditorTool(tool),
      onToggleXray: (on) => {
        this.editorXray = on
        TrainingBot.showHitboxes = on
        this.botRenderers.forEach((r) => r.refreshHitboxDebugMeshes())
      },
      onToggleWireframe: (on) => {
        this.editorWireframe = on
        this.botRenderers.forEach((r) => r.setWireframe(on))
      },
      onToggleAxes: (on) => {
        this.editorAxes = on
        this.botRenderers.forEach((r) => r.setAxesVisible(on))
      },
      onToggleLookAtPlayer: (on) => {
        const bot = this.trainingBots[0]
        if (bot) bot.lookAtPlayer = on
      },
      onToggleHitZonesOnly: (on) => {
        this.editorHitZonesOnly = on
        this.botRenderers.forEach((r) => r.setHitZonesOnly(on))
      },
      onScale: (value) => {
        const bot = this.trainingBots[0]
        const mesh = this.botRenderers[0]?.getRoot()
        if (!bot || !mesh) return
        bot.visualScale = value
        mesh.scale.setScalar(value)
        this.syncBotFromMesh()
      },
      onNudge: (axis, delta) => {
        const bot = this.trainingBots[0]
        const mesh = this.botRenderers[0]?.getRoot()
        if (!bot || !mesh) return
        bot.lookAtPlayer = false
        bot.position[axis] += delta
        bot.spawnPosition.copy(bot.position)
        mesh.position.copy(bot.position)
        this.transformControls?.attach(mesh)
      },
      onYaw: (deltaRad) => {
        const bot = this.trainingBots[0]
        const mesh = this.botRenderers[0]?.getRoot()
        if (!bot || !mesh) return
        bot.lookAtPlayer = false
        bot.yaw += deltaRad
        mesh.rotation.y = bot.yaw
      },
      onSnapGround: () => this.editorSnapGround(),
      onResetPose: () => this.editorResetPose(),
      onPreviewAnim: (clip) => {
        this.editorPreviewAnim = clip
        // Playing an animation exits bone-pose mode and re-grabs the whole bot
        if (this.editorBoneKey) {
          this.editorBoneKey = ''
          const root = this.botRenderers[0]?.getRoot()
          if (root) this.transformControls?.attach(root)
          this.setEditorTool(this.editorTool === 'select' ? 'translate' : this.editorTool)
        }
        this.botRenderers[0]?.previewAnim(clip)
        // FPS look: drive viewmodel Idle/Move from the hand pack animations
        if (this.editorFpsLook) {
          const fps = this.currentPlayer?.renderer as FPSRenderer | undefined
          const vm = fps?.fpsMesh
          if (!vm) return
          if (vm.key === 'AK47') {
            if (clip === 'Idle') vm.holdPoseAt(0)
            return
          }
          if (clip === 'Idle' && vm.animations.has('Idle')) {
            vm.playAnimation('Idle', true, true, 1.0)
          } else if (vm.animations.has('Move')) {
            vm.playAnimation('Move', true, true, 1.25)
          }
        }
      },
      onSelectWeapon: (key) => {
        this.editorWeapon = key
        this.botRenderers[0]?.setWeapon(key)
        if (this.editorFpsLook) {
          const fps = this.currentPlayer?.renderer as FPSRenderer | undefined
          fps?.equipEditorWeapon(key)
        }
      },
      onSelectBone: (boneKey) => this.selectEditorBone(boneKey),
      onBoneRot: (x, y, z) => {
        if (!this.editorBoneKey) return
        this.botRenderers[0]?.setBoneOffsetDeg(this.editorBoneKey, x, y, z)
      },
      onResetBone: () => {
        if (!this.editorBoneKey) return
        this.botRenderers[0]?.resetBone(this.editorBoneKey)
        this.editorMenu?.refresh()
      },
      getPoseText: () => this.botRenderers[0]?.getPoseEditsText() ?? '',
      onFpsLook: () => this.editorEnableFpsLook(),
      onEditCursor: () => this.editorEnableEditCursor(),
      onExit: () => this.returnToMenu(),
      getState: () => {
        const bot = this.trainingBots[0]
        return {
          tool: this.editorTool,
          xray: this.editorXray,
          wireframe: this.editorWireframe,
          axes: this.editorAxes,
          lookAtPlayer: !!bot?.lookAtPlayer,
          hitZonesOnly: this.editorHitZonesOnly,
          scale: bot?.visualScale ?? 1,
          pos: {
            x: bot?.position.x ?? 0,
            y: bot?.position.y ?? 0,
            z: bot?.position.z ?? 0,
          },
          yawDeg: ((bot?.yaw ?? 0) * 180) / Math.PI,
          fpsLook: this.editorFpsLook,
          previewAnim: this.editorPreviewAnim,
          weapon: this.editorWeapon,
          selectedBone: this.editorBoneKey,
          boneRot: this.editorBoneKey
            ? this.botRenderers[0]?.getBoneOffsetDeg(this.editorBoneKey) ?? { x: 0, y: 0, z: 0 }
            : { x: 0, y: 0, z: 0 },
        }
      },
    })
    return this.editorMenu
  }

  /** Editor rig: attach the gizmo to a bone (rotate) or back to the whole bot. */
  private selectEditorBone(boneKey: string): void {
    const renderer = this.botRenderers[0]
    const controls = this.transformControls
    if (!renderer || !controls) return
    const enteringRig = !!boneKey && !this.editorBoneKey
    this.editorBoneKey = boneKey

    if (!boneKey) {
      renderer.setBoneEditMode(false)
      controls.attach(renderer.getRoot())
      this.setEditorTool(this.editorTool === 'select' ? 'translate' : this.editorTool)
      this.editorMenu?.refresh()
      return
    }

    const bone = renderer.getBoneByKey(boneKey)
    if (!bone) return
    // Stop the bot turning to face the player so the posed joint stays put
    const bot = this.trainingBots[0]
    if (bot) bot.lookAtPlayer = false
    // First time entering rig mode: snap to bind so edits are clean offsets
    if (enteringRig) renderer.beginBoneEdit()
    else renderer.setBoneEditMode(true)
    controls.attach(bone)
    controls.setMode('rotate')
    controls.enabled = true
    controls.visible = true
    this.editorMenu?.refresh()
  }

  private setupEditorTools(target: THREE.Object3D): void {
    const camera = this.currentPlayer.cameraManager?.camera
    if (!camera) return

    const controls = new TransformControls(camera, this.renderer.domElement)
    controls.setMode('translate')
    controls.setSize(0.95)
    controls.attach(target)
    controls.addEventListener('dragging-changed', (event: any) => {
      this.editorDragging = !!event.value
      // Posing a bone must not write back to the bot's root transform
      if (!this.editorDragging && !this.editorBoneKey) this.syncBotFromMesh()
    })
    controls.addEventListener('objectChange', () => {
      if (!this.editorBoneKey) this.syncBotFromMesh()
      this.editorMenu?.refresh()
    })

    this.renderer.scene.add(controls as unknown as THREE.Object3D)
    this.transformControls = controls
    this.setEditorTool('translate')

    this.boundEditorKeys = (e: KeyboardEvent) => {
      if (!this.editorActive || this.editorFpsLook) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'q' || e.key === 'Q') this.setEditorTool('select')
      if (e.key === 'w' || e.key === 'W') this.setEditorTool('translate')
      if (e.key === 'e' || e.key === 'E') this.setEditorTool('rotate')
      if (e.key === 'r' || e.key === 'R') this.setEditorTool('scale')
      if (e.key === 'Escape') this.editorEnableEditCursor()
      this.editorMenu?.refresh()
    }
    window.addEventListener('keydown', this.boundEditorKeys)
  }

  private setEditorTool(tool: EditorTool): void {
    this.editorTool = tool
    if (!this.transformControls) return
    if (tool === 'select') {
      this.transformControls.enabled = false
      this.transformControls.visible = false
      return
    }
    this.transformControls.enabled = true
    this.transformControls.visible = true
    this.transformControls.setMode(tool)
  }

  private syncBotFromMesh(): void {
    const bot = this.trainingBots[0]
    const mesh = this.botRenderers[0]?.getRoot()
    if (!bot || !mesh) return
    bot.position.set(mesh.position.x, mesh.position.y, mesh.position.z)
    bot.spawnPosition.copy(bot.position)
    bot.yaw = mesh.rotation.y
    const sx = mesh.scale.x
    if (Number.isFinite(sx) && sx > 0.01) bot.visualScale = sx
    if (this.editorDragging) bot.lookAtPlayer = false
  }

  private editorSnapGround(): void {
    const bot = this.trainingBots[0]
    const mesh = this.botRenderers[0]?.getRoot()
    if (!bot || !mesh) return
    const hit = this.physics.raycast(
      new Vector3D(bot.position.x, bot.position.y + 6, bot.position.z),
      new Vector3D(bot.position.x, bot.position.y - 20, bot.position.z)
    )
    if (hit?.hasHit && hit.hitPosition) {
      bot.position.y = hit.hitPosition.y
      bot.spawnPosition.copy(bot.position)
      mesh.position.y = bot.position.y
    }
  }

  private editorResetPose(): void {
    const bot = this.trainingBots[0]
    const renderer = this.botRenderers[0]
    const mesh = renderer?.getRoot()
    const home = bot?.editorHome
    if (!bot || !mesh || !home) return
    // Leave bone-pose mode and restore the animation on reset
    this.editorBoneKey = ''
    renderer?.previewAnim(this.editorPreviewAnim)
    bot.position.set(home.x, home.y, home.z)
    bot.spawnPosition.copy(bot.position)
    bot.yaw = home.yaw
    bot.visualScale = home.scale
    bot.lookAtPlayer = true
    mesh.position.copy(bot.position)
    mesh.rotation.set(0, bot.yaw, 0)
    mesh.scale.setScalar(bot.visualScale)
    this.transformControls?.attach(mesh)
    this.setEditorTool(this.editorTool === 'select' ? 'translate' : this.editorTool)
    this.editorMenu?.refresh()
  }

  private editorEnableFpsLook(): void {
    this.editorFpsLook = true
    // FPS look = roam and watch the dummy react, so make him track the player again.
    // (Posing / nudging / rig editing turns this off; re-enable it here.)
    const bot = this.trainingBots[0]
    if (bot) bot.lookAtPlayer = true
    if (this.transformControls) {
      this.transformControls.enabled = false
      this.transformControls.visible = false
    }
    // Editor-only viewmodels (new AKM arms; USP/Knife reuse those arms)
    const fps = this.currentPlayer?.renderer as FPSRenderer | undefined
    const key = this.editorWeapon === 'Knife' || this.editorWeapon === 'AK' || this.editorWeapon === 'Usp'
      ? this.editorWeapon
      : 'AK'
    fps?.equipEditorWeapon(key)
    this.inputManager.gameplayEnabled = true
    setTimeout(() => this.inputManager.onLock(), 40)
    this.editorMenu?.refresh()
  }

  private editorEnableEditCursor(): void {
    this.editorFpsLook = false
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    if (this.transformControls && this.editorTool !== 'select') {
      this.transformControls.enabled = true
      this.transformControls.visible = true
    }
    this.editorMenu?.refresh()
  }

  private teardownEditorTools(): void {
    this.editorBoneKey = ''
    if (this.boundEditorKeys) {
      window.removeEventListener('keydown', this.boundEditorKeys)
      this.boundEditorKeys = null
    }
    if (this.transformControls) {
      this.transformControls.detach()
      this.transformControls.removeFromParent()
      this.transformControls.dispose()
      this.transformControls = null
    }
    this.editorMenu?.hide()
    this.editorActive = false
    this.editorDragging = false
    TrainingBot.showHitboxes = false
  }

  /** Load world + player; bots spawn when match starts from menu */
  public onLoad(): void {
    this.renderer = new Renderer(this.players)
    const playerWrapper = PlayerWrapper.default()
    this.setCurrentPlayer(playerWrapper)
    this.addPlayer(playerWrapper)
    this.setPhysicsObjects()
  }

  public setMobileControls(controls: MobileControls): void {
    this.mobileControls = controls
  }

  public getMobileControls(): MobileControls | null {
    return this.mobileControls
  }

  public syncMobileControls(): void {
    const on =
      !!this.mobileControls &&
      this.matchStarted &&
      !this.matchPaused &&
      !this.awaitingLoadout &&
      this.inputManager.gameplayEnabled &&
      !this.editorActive
    this.mobileControls?.setActive(on)
    if (on && isTouchDevice()) {
      this.inputManager.setMobileMode(true)
    } else if (!on && !this.editorActive) {
      this.inputManager.setMobileMode(false)
    }
  }

  public startBotMatch(config: BotMatchConfig): void {
    this.lastMatchConfig = config
    this.clearBots()
    this.stats.reset()
    this.playerName = config.playerName || 'Player'
    this.refillAmmoOnKill = !!config.refillAmmoOnKill
    this.matchStarted = true
    this.matchPaused = false
    this.combatLive = false
    this.awaitingLoadout = true
    this.lockdownTimer = 0
    this.matchRules = rulesForLength(config.matchLength)
    this.matchElapsed = 0
    this.matchOver = false
    this.inputManager.gameplayEnabled = true
    this.syncMobileControls()
    this.applyMapMoveSpeed(this.activeMapId)

    this.teamScores = { T: 0, CT: 0 }
    this.teamSize = clampTeamSize(config.teamSize)
    this.teamPlay = !!config.teamPlay && mapSupportsTeams(this.activeMapId)
    if (this.teamPlay) this.playerTeam = config.playerTeam ?? 'CT'

    // Team play fills both sides to the chosen size; the player takes one slot.
    // A bot count of 0 still means "no bots" (pure PvP lobbies and joining clients).
    // Phones can't afford a full 5v5 of skinned bots on Dust II — hard-cap at 5.
    let botCount = this.teamPlay && config.botCount > 0 ? this.teamSize * 2 - 1 : config.botCount
    if (isTouchDevice() && botCount > 5) botCount = 5

    // Assign unique spawns: player first, then bots (never same point)
    const assignment = this.assignMatchSpawns(botCount)
    if (this.currentPlayer) {
      this.currentPlayer.player.teleportToSpawn(assignment.playerPos)
    }

    this.nameQueue = pickBotNames(botCount)
    this.pendingBotSpawns = assignment.botPositions.map((pos, i) => ({
      pos,
      yaw: Math.random() * Math.PI * 2,
      difficulty: config.difficulty,
      name: this.nameQueue[i] || `BOT ${i + 1}`,
      team: assignment.botTeams[i] ?? null,
    }))
    this.botSpawnAcc = 0
    // Two up front, the rest trickle in during the loadout pick / lockdown so a
    // 9-bot match doesn't clone nine skeletons in a single frame
    this.flushPendingBots(2)

    this.mobileControls?.setActive(false)
    this.inputManager.setMobileMode(false)
    this.renderer.hud?.showGameplay()
    this.renderer.hud?.setLockdown(null)
    this.renderer.hud?.setScoreboardVisible(false)
    this.renderer.hud?.setPauseMenuOpen(false)
    this.renderer.hud?.hideMatchResult()
    this.renderer.hud?.setMatchStatus(null)
    this.renderer.hud?.showLoadoutPicker((primary) => this.confirmMatchLoadout(primary))

    this.inputManager.unlock()
    void this.warmAudio()
  }

  public async startMultiplayerMatch(config: MultiplayerStartConfig): Promise<string> {
    const mp = new MultiplayerMatch()
    this.multiplayer?.stop()
    this.multiplayer = mp
    const mapId = config.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
    const { code, role } = await mp.start(config)
    const botCount =
      role === 'host' ? botTargetForHumans(1, config.botCount ?? 10) : 0
    this.teamMode = config.teamMode ?? 'ffa'
    this.startBotMatch({
      difficulty: config.difficulty || 'medium',
      botCount,
      playerName: config.playerName,
      refillAmmoOnKill: false,
      mapId,
      matchLength: config.matchLength ?? DEFAULT_MATCH_LENGTH,
      teamPlay: config.teamPlay,
      playerTeam: config.playerTeam,
      teamSize: config.teamSize,
    })
    this.showMpBanner(code, role === 'host')
    return code
  }

  /** Joining client: switch to the host's map and land on a spawn. */
  public async adoptMultiplayerMap(mapId: MapId): Promise<void> {
    const id = mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
    if (this.activeMapId === id && this.activeMapMesh) return
    await this.ensureMap(id)
    if (this.currentPlayer?.player && !this.currentPlayer.player.isDead) {
      this.currentPlayer.player.teleportToSpawn(this.pickRespawnPosition(undefined, false))
    }
  }

  public getMultiplayer(): MultiplayerMatch | null {
    return this.multiplayer
  }

  public reconcileAiBotCount(desired: number): void {
    if (isTouchDevice()) desired = Math.min(desired, 5)
    const live = this.trainingBots.filter((b) => !b.isNetworkPuppet)
    let have = live.length + this.pendingBotSpawns.length
    if (have > desired) {
      let remove = have - desired
      while (remove > 0 && this.pendingBotSpawns.length) {
        this.pendingBotSpawns.pop()
        remove--
        have--
      }
      for (let i = this.trainingBots.length - 1; i >= 0 && remove > 0; i--) {
        const b = this.trainingBots[i]
        if (b.isNetworkPuppet) continue
        this.trainingBots.splice(i, 1)
        const ren = this.botRenderers.splice(i, 1)[0]
        ren?.dispose()
        remove--
      }
      return
    }
    if (have < desired) {
      const need = desired - have
      const difficulty = this.lastMatchConfig?.difficulty || 'medium'
      const names = pickBotNames(need)
      for (let i = 0; i < need; i++) {
        const team = this.teamPlay ? this.smallestTeam() : null
        const pos = this.pickRespawnPosition(new Vector3D(0, 2, 0), true, team)
        this.pendingBotSpawns.push({
          pos,
          yaw: Math.random() * Math.PI * 2,
          difficulty,
          name: names[i] || `BOT ${live.length + i + 1}`,
          team,
        })
      }
    }
  }

  private showMpBanner(code: string, _isHost: boolean): void {
    this.hideMpBanner()
    const el = document.createElement('div')
    el.id = 'kos-mp-banner'
    el.textContent = code
    el.style.cssText =
      'position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:46;pointer-events:auto;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;padding:6px 12px;border-radius:999px;font:800 13px Outfit,Segoe UI,sans-serif;letter-spacing:0.14em;color:#fff;background:rgba(8,14,28,0.72);border:1px solid rgba(90,160,255,0.45);backdrop-filter:blur(8px);text-shadow:0 1px 2px #000;cursor:pointer'
    el.title = 'Tap to copy room code'
    el.addEventListener('selectstart', (e) => e.preventDefault())
    el.addEventListener('click', () => {
      void navigator.clipboard?.writeText(code).catch(() => undefined)
    })
    document.body.appendChild(el)
    this.mpBanner = el
  }

  private hideMpBanner(): void {
    this.mpBanner?.remove()
    this.mpBanner = null
  }

  public isAwaitingLoadout(): boolean {
    return this.awaitingLoadout
  }

  public confirmMatchLoadout(primary: 'AK47' | 'AWP'): void {
    if (!this.awaitingLoadout || !this.matchStarted) return
    this.awaitingLoadout = false
    this.currentPlayer?.player.equipSpawnLoadout(primary)
    this.lockdownTimer = this.lockdownDuration
    this.combatLive = false
    this.renderer.hud?.hideLoadoutPicker()
    this.renderer.hud?.setLockdown(this.lockdownTimer)
    this.crosshairRenderer?.resize()
    void this.audioManager.playSwitch(primary)
    this.syncMobileControls()
    setTimeout(() => this.inputManager.onLock(), 40)
  }

  /** Download + parse a map GLB into the cache without installing it in the scene. */
  public prefetchMap(mapId: MapId): void {
    const id = mapId === 'de_dust2' ? 'de_dust2' : 'pool_day'
    const gen = ++this.mapPrefetchGen
    void (async () => {
      try {
        // Keep only the selected map cached while browsing the menu.
        for (const other of ['pool_day', 'de_dust2'] as MapId[]) {
          if (other === id) continue
          const otherDef = getMapDefinition(other)
          if (this.activeMapMesh?.key === otherDef.meshKey) continue
          this.globalLoadingManager.disposeMapMesh(otherDef.meshKey)
        }
        if (gen !== this.mapPrefetchGen) return
        const def = getMapDefinition(id)
        await this.globalLoadingManager.loadMapMesh(def.meshKey, def.glbPath, def.usePoolLights, false)
      } catch (e) {
        console.warn('[map:prefetch]', id, e)
      }
    })()
  }

  /** Load / swap map before match start (Pool Day or Dust II). */
  public async ensureMap(mapId: MapId): Promise<void> {
    if (this.activeMapId === mapId && this.activeMapMesh) return

    const def = getMapDefinition(mapId)
    const mapMesh = await this.globalLoadingManager.loadMapMesh(
      def.meshKey,
      def.glbPath,
      def.usePoolLights,
      false
    )

    if (def.normalizeToSize) {
      mapMesh.normalizeForPlay(def.normalizeToSize)
    }

    // Drop the previous map's GPU resources — phones can't hold both.
    this.unloadActiveMap(true)

    mapMesh.init()
    const extras: THREE.Object3D[] = []
    const actorStart = this.actors.length
    mapMesh.addPhysics(this, { usePoolLights: def.usePoolLights, extras })
    this.mapColliders = this.actors.slice(actorStart)
    this.mapExtras = extras
    this.activeMapMesh = mapMesh
    this.addToRenderer(mapMesh.mesh)
    mapMesh.mesh.visible = true

    if (def.useDebugCubes) {
      this.spawnDebugCubes()
    }

    const box = mapMesh.getWorldBounds()
    console.log('[map]', mapId, {
      min: box.min.toArray(),
      max: box.max.toArray(),
      size: box.getSize(new THREE.Vector3()).toArray(),
      colliders: this.mapColliders.length,
    })

    if (def.spawns.length > 1) {
      this.activeSpawns = def.spawns
    } else {
      const probe: ProbeFn = (from, to) => {
        const hit = this.physics.raycast(new Vector3D(from.x, from.y, from.z), new Vector3D(to.x, to.y, to.z))
        return { hasHit: hit.hasHit, point: hit.hitPosition, normal: hit.hitNormal }
      }
      const derived = deriveSpawnsFromGeometry(
        { x: box.min.x, y: box.min.y, z: box.min.z },
        { x: box.max.x, y: box.max.y, z: box.max.z },
        probe
      )
      this.activeSpawns = derived.length >= 2
        ? derived
        : spawnsFromBounds(
            { x: box.min.x, y: box.min.y, z: box.min.z },
            { x: box.max.x, y: box.max.y, z: box.max.z },
            2.2
          )
      console.log('[map] derived spawns', mapId, this.activeSpawns.length)
    }

    this.activeMapId = mapId
    this.mapName = mapId
    this.applyMapMoveSpeed(mapId)
    this.warmMapRender()
  }

  /** A freshly swapped map brings its own materials and shadow pass — compile now. */
  private warmMapRender(): void {
    const renderer = this.renderer
    if (!renderer?.camera) return
    try {
      renderer.compile(renderer.scene, renderer.camera)
      renderer.warmRenderPipeline()
    } catch (e) {
      console.warn('[warm:map]', e)
    }
  }

  private applyMapMoveSpeed(mapId: MapId): void {
    const scale = getMapDefinition(mapId).moveSpeedScale ?? 1
    this.currentPlayer?.player.setMapSpeedScale(scale)
  }

  private unloadActiveMap(disposeGpu = false): void {
    for (const actor of this.mapColliders) {
      if (actor.body) this.physics.remove(actor.body)
      this.actors = this.actors.filter((a) => a !== actor)
    }
    this.mapColliders = []

    for (const obj of this.mapExtras) {
      this.renderer?.scene.remove(obj)
    }
    this.mapExtras = []

    for (const mesh of this.debugPropMeshes) {
      this.renderer?.scene.remove(mesh)
    }
    this.debugPropMeshes = []

    if (this.activeMapMesh?.mesh) {
      this.renderer?.scene.remove(this.activeMapMesh.mesh)
    }
    const key = this.activeMapMesh?.key
    this.activeMapMesh = null
    if (disposeGpu && key) {
      this.globalLoadingManager.disposeMapMesh(key)
    }
  }

  /** Detach + free the active map (menu return). Weapons/bots stay warm. */
  public releaseMap(): void {
    this.mapPrefetchGen++
    this.unloadActiveMap(true)
    this.activeMapId = DEFAULT_MAP_ID
    this.mapName = DEFAULT_MAP_ID
    this.activeSpawns = []
  }

  private spawnDebugCubes(): void {
    for (let j = 1; j < 10; j++) {
      const cube = new CubeRenderer(new Vector3D(10 + j * 2.5, 5, 46), new Vector3D(0, 0, 0), new Vector3D(2, 2, 2), 25)
      this.actors.push(cube)
      this.mapColliders.push(cube)
      cube.addToWorld(this.physics)
      this.addToRenderer(cube.mesh)
      this.debugPropMeshes.push(cube.mesh)
    }
  }

  public pauseMatch(): void {
    if (!this.matchStarted || this.matchPaused) return
    this.matchPaused = true
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.syncMobileControls()
    this.renderer.hud?.setScoreboardVisible(false)
    this.renderer.hud?.setPauseMenuOpen(true)
  }

  public resumeMatch(): void {
    if (!this.matchStarted || !this.matchPaused) return
    this.matchPaused = false
    this.inputManager.gameplayEnabled = true
    this.renderer.hud?.setPauseMenuOpen(false)
    this.syncMobileControls()
    setTimeout(() => this.inputManager.onLock(), 40)
  }

  public returnToMenu(): void {
    this.teardownEditorTools()
    this.multiplayer?.stop()
    this.multiplayer = null
    this.hideMpBanner()
    this.matchPaused = false
    this.matchStarted = false
    this.combatLive = false
    this.awaitingLoadout = false
    this.lockdownTimer = 0
    this.matchOver = false
    this.matchElapsed = 0
    this.clearBots()
    this.stats.reset()
    // Free the arena GPU while the menu is up; weapons/character stay cached.
    this.releaseMap()
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.syncMobileControls()
    this.renderer.hud?.setPauseMenuOpen(false)
    this.renderer.hud?.setLockdown(null)
    this.renderer.hud?.hideLoadoutPicker()
    this.renderer.hud?.hideMatchResult()
    this.renderer.hud?.setMatchStatus(null)
    this.renderer.hud?.setScoreboardVisible(false)
    const hudRoot = document.getElementById('game-hud')
    if (hudRoot) hudRoot.style.display = 'none'
    const hudTop = document.getElementById('game-hud-top')
    if (hudTop) hudTop.style.display = 'none'
    document.getElementById('game-crosshair')?.classList.remove('is-on', 'is-awp-hidden')
    document.getElementById('awp-scope')?.classList.remove('is-on')
    this.onReturnToMenu?.()
  }

  /**
   * Pick unique spawn points from MATCH_SPAWNS.
   * Player gets one; bots get others — never the same coordinate.
   */
  private assignMatchSpawns(botCount: number): {
    playerPos: Vector3D
    botPositions: Vector3D[]
    botTeams: Array<Team | null>
  } {
    if (this.teamPlay) return this.assignTeamSpawns(botCount)
    const spawns = this.activeSpawns
    const indices = shuffleInPlace([...spawns.keys()])
    const playerIdx = indices[0] ?? 0
    const playerPos = spawnToPlayerVector(spawns[playerIdx] ?? { x: 0, y: 2, z: 0 })

    const used = new Set<number>([playerIdx])
    const botPositions: Vector3D[] = []
    const need = Math.min(botCount, Math.max(0, spawns.length - 1))

    for (const idx of indices) {
      if (botPositions.length >= need) break
      if (used.has(idx)) continue
      used.add(idx)
      botPositions.push(spawnToBotVector(spawns[idx]))
    }
    return { playerPos, botPositions, botTeams: botPositions.map(() => null) }
  }

  /**
   * Team deathmatch: each side starts in its own spawn pit. The player takes one
   * slot on their chosen side, bots fill the rest of both sides.
   */
  private assignTeamSpawns(botCount: number): {
    playerPos: Vector3D
    botPositions: Vector3D[]
    botTeams: Array<Team | null>
  } {
    const sides = this.teamSpawnLists()
    const mine = shuffleInPlace([...(sides?.[this.playerTeam] ?? this.activeSpawns)])
    const theirs = shuffleInPlace([...(sides?.[otherTeam(this.playerTeam)] ?? this.activeSpawns)])
    const playerPos = spawnToPlayerVector(mine.shift() ?? { x: 0, y: 2, z: 0 })

    const botPositions: Vector3D[] = []
    const botTeams: Array<Team | null> = []
    const friends = Math.min(this.teamSize - 1, mine.length)
    const enemies = Math.min(botCount - friends, theirs.length)

    for (let i = 0; i < friends; i++) {
      botPositions.push(spawnToBotVector(mine[i]))
      botTeams.push(this.playerTeam)
    }
    for (let i = 0; i < enemies; i++) {
      botPositions.push(spawnToBotVector(theirs[i]))
      botTeams.push(otherTeam(this.playerTeam))
    }
    return { playerPos, botPositions, botTeams }
  }

  private teamSpawnLists(): Record<Team, ReadonlyArray<SpawnPoint>> | null {
    return getMapDefinition(this.activeMapId).teamSpawns ?? null
  }

  /**
   * Respawn: pick a free spawn far from everyone currently alive.
   * Never reuse a point another bot/player is standing on.
   */
  /**
   * Respawn: pick a free spawn far from everyone currently alive.
   * @param forBot — bots use ground Y; player uses capsule Y from the list
   */
  public pickRespawnPosition(preferAwayFrom?: Vector3D, forBot = false, team?: Team | null): Vector3D {
    const spawnList = (this.teamPlay && team && this.teamSpawnLists()?.[team]) || this.activeSpawns
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

    for (let i = 0; i < spawnList.length; i++) {
      const s = spawnList[i]
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
      const s = spawnList[r.idx]
      return occupied.every((o) => flatDistXZ(s.x, s.z, o.x, o.z) >= minClear)
    })
    const pick = clear ?? ranked[0]
    const s = spawnList[pick?.idx ?? 0] ?? { x: 0, y: 2, z: 0 }
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
        team: this.teamPlay ? this.playerTeam : undefined,
      },
    ]
    for (const bot of this.trainingBots) {
      rows.push({
        name: bot.name,
        kills: bot.kills,
        deaths: bot.deaths,
        assists: bot.assists,
        isYou: false,
        team: this.teamPlay ? (bot.team ?? undefined) : undefined,
      })
    }
    rows.sort((a, b) => b.kills - a.kills || b.assists - a.assists || a.deaths - b.deaths)
    if (this.teamPlay) {
      // Your side first so the board reads as two teams, not one ladder
      rows.sort((a, b) => Number(b.team === this.playerTeam) - Number(a.team === this.playerTeam))
    }
    return rows
  }

  public isCombatLive(): boolean {
    return this.matchStarted && this.combatLive && !this.matchOver && this.lockdownTimer <= 0
  }

  public isMatchOver(): boolean {
    return this.matchOver
  }

  /** Humans on one side, bots on the other. Off means everyone for themselves. */
  public isCoopTeams(): boolean {
    return this.teamMode === 'coop' && !!this.multiplayer
  }

  public setTeamMode(mode: TeamMode): void {
    this.teamMode = mode
  }

  /** T vs CT deathmatch is running */
  public isTeamPlay(): boolean {
    return this.teamPlay
  }

  public getLocalPlayerTeam(): Team | null {
    return this.teamPlay ? this.playerTeam : null
  }

  public getTeamSize(): number {
    return this.teamSize
  }

  public getTeamScores(): Record<Team, number> {
    return { ...this.teamScores }
  }

  /** Clients adopt the side the host put them on. */
  public setLocalPlayerTeam(team: Team): void {
    if (this.playerTeam === team) return
    this.playerTeam = team
    this.moveLocalPlayerToTeamSpawn()
  }

  /** Turn team play on for a multiplayer match the host configured. */
  public enableTeamPlay(team: Team, teamSize: number): void {
    this.teamSize = clampTeamSize(teamSize)
    if (!mapSupportsTeams(this.activeMapId)) return
    const changed = !this.teamPlay || this.playerTeam !== team
    this.teamPlay = true
    this.playerTeam = team
    if (changed) this.moveLocalPlayerToTeamSpawn()
  }

  private moveLocalPlayerToTeamSpawn(): void {
    if (!this.teamPlay) return
    const player = this.currentPlayer?.player
    if (!player || player.isDead) return
    player.teleportToSpawn(this.pickRespawnPosition(undefined, false, this.playerTeam))
  }

  public isFriendlyToLocalPlayer(bot: TrainingBot): boolean {
    if (!this.teamPlay || !bot.team) return false
    return bot.team === this.playerTeam
  }

  /** Outline tint for a teammate silhouette; null when they shouldn't be outlined. */
  public teamOutlineColor(bot: TrainingBot): number | null {
    if (!this.teamPlay || !bot.team) return null
    return TEAM_COLOR[bot.team]
  }

  public areBotsFriendly(a: TrainingBot, b: TrainingBot): boolean {
    if (!this.teamPlay) return false
    return !!a.team && a.team === b.team
  }

  /** Side with fewer bodies — used when filling a lobby with bots mid-match. */
  private smallestTeam(): Team {
    const count: Record<Team, number> = { T: 0, CT: 0 }
    count[this.playerTeam]++
    for (const bot of this.trainingBots) {
      if (bot.team) count[bot.team]++
    }
    for (const pending of this.pendingBotSpawns) {
      if (pending.team) count[pending.team]++
    }
    return count.T <= count.CT ? 'T' : 'CT'
  }

  private creditTeam(team: Team | null | undefined): void {
    if (!this.teamPlay || !team) return
    this.teamScores[team]++
  }

  /** Highest kill count on the board, used for the "first to N" race. */
  private leadingKills(): number {
    if (this.teamPlay) return Math.max(this.teamScores.T, this.teamScores.CT)
    let best = this.stats.kills
    for (const bot of this.trainingBots) {
      if (bot.kills > best) best = bot.kills
    }
    return best
  }

  /** Team play races to a shared team score instead of an individual one. */
  private raceScore(): number {
    return this.teamPlay ? this.teamScores[this.playerTeam] : this.stats.kills
  }

  private checkMatchEnd(): void {
    if (!this.matchStarted || this.matchOver) return
    const { killLimit, timeLimitSec } = this.matchRules
    if (killLimit > 0 && this.leadingKills() >= killLimit) {
      this.endMatch('killLimit')
      return
    }
    if (timeLimitSec > 0 && this.matchElapsed >= timeLimitSec) {
      this.endMatch('timeLimit')
    }
  }

  private endMatch(reason: MatchEndReason): void {
    if (this.matchOver) return
    this.matchOver = true
    this.combatLive = false

    const rows = this.getScoreboardRows()
    const placement = Math.max(1, rows.findIndex((r) => r.isYou) + 1)
    const won = this.teamPlay
      ? this.teamScores[this.playerTeam] >= this.teamScores[otherTeam(this.playerTeam)]
      : placement === 1
    const result: MatchResult = {
      reason,
      won,
      placement,
      totalPlayers: rows.length,
      rows,
      durationSec: this.matchElapsed,
      kills: this.stats.kills,
      deaths: this.stats.deaths,
      assists: this.stats.assists,
      headshots: this.stats.headshots,
      bestStreak: this.stats.bestStreak,
      accuracy: this.stats.accuracy(),
      career: CareerStats.record(this.stats, won, this.matchElapsed),
    }

    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
    this.syncMobileControls()
    this.renderer.hud?.setLockdown(null)
    this.renderer.hud?.setScoreboardVisible(false)
    this.renderer.hud?.setPauseMenuOpen(false)
    this.renderer.hud?.setMatchStatus(null)
    this.renderer.hud?.showMatchResult(result, {
      onRematch: () => this.rematch(),
      onMenu: () => this.returnToMenu(),
    })
  }

  public rematch(): void {
    const config = this.lastMatchConfig
    this.renderer.hud?.hideMatchResult()
    if (!config) {
      this.returnToMenu()
      return
    }
    this.startBotMatch(config)
  }

  private syncMatchStatus(): void {
    const { killLimit, timeLimitSec } = this.matchRules
    if (killLimit <= 0 && timeLimitSec <= 0) {
      this.renderer.hud?.setMatchStatus(null)
      // An endless team match still needs the side scores
      if (this.teamPlay) {
        this.renderer.hud?.setTeamScores({
          you: this.playerTeam,
          T: this.teamScores.T,
          CT: this.teamScores.CT,
        })
      }
      return
    }
    this.renderer.hud?.setMatchStatus({
      kills: this.raceScore(),
      leaderKills: this.leadingKills(),
      killLimit,
      secondsLeft: timeLimitSec > 0 ? Math.max(0, timeLimitSec - this.matchElapsed) : null,
      teams: this.teamPlay
        ? { you: this.playerTeam, T: this.teamScores.T, CT: this.teamScores.CT }
        : null,
    })
  }

  public async prepareCombat(): Promise<void> {
    await this.warmGraphics()
    await this.warmAudio()
  }

  /**
   * Everything a first shot / first hit / first bot would otherwise compile or
   * allocate mid-match. Safe to run from the loading screen — no audio, no user
   * gesture needed — and idempotent, so match start is free once it has run.
   */
  public async warmGraphics(): Promise<void> {
    if (this.graphicsWarmed) return
    this.graphicsWarmed = true
    try {
      const renderer = this.renderer
      const fpsRenderer = this.currentPlayer?.renderer as FPSRenderer | undefined
      /**
       * Warm effects are staged far below the map so the player never sees them,
       * which also means the real camera frustum-culls them and their textures are
       * never uploaded. Render the staging area with a camera that can actually see
       * it, otherwise the first bot / first hit still pays for the upload.
       */
      const camera = new THREE.PerspectiveCamera(110, 1, 0.1, 5000)
      camera.position.set(0, -500, 250)
      camera.lookAt(0, -600, 0)
      camera.updateMatrixWorld(true)

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

      // Bake the third-person gun props and compile the bot skin once, so the
      // bots that spawn at match start only pay for a skeleton clone
      TrainingBotRenderer.prewarm(this, renderer, renderer.scene, camera)

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
      // Second pass next frame: textures that streamed in during the first draw
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      renderer.render(renderer.scene, camera)
      renderer.warmRenderPipeline()
    } catch (e) {
      console.warn('[warm:graphics]', e)
    }
  }

  /** Needs a user gesture, so this only runs once the player starts a match. */
  public async warmAudio(): Promise<void> {
    try {
      await Promise.race([this.audioManager.unlock(), new Promise<void>((r) => setTimeout(r, 800))])
      if (!this.audioWarmed) {
        this.audioWarmed = true
        await this.audioManager.warmPlayback()
      }
    } catch (e) {
      console.warn('[warm:audio]', e)
    } finally {
      this.effectsWarmed = true
    }
  }

  private flushPendingBots(maxThisFrame: number): void {
    const botGuns = ['AK47', 'Usp', 'AWP'] as const
    let n = 0
    while (n < maxThisFrame && this.pendingBotSpawns.length > 0) {
      const p = this.pendingBotSpawns.shift()!
      const bot = new TrainingBot(p.pos, p.yaw, p.difficulty, p.name)
      bot.team = p.team
      bot.visualModel = 'CsTerrorist'
      bot.weaponKey = botGuns[Math.floor(Math.random() * botGuns.length)]
      bot.addToWorld(this.physics)
      const renderer = new TrainingBotRenderer(bot)
      this.trainingBots.push(bot)
      this.botRenderers.push(renderer)
      n++
    }
  }

  /** Player got the kill */
  public onPlayerKill(victim: TrainingBot, weaponKey: string, headshot: boolean): void {
    this.stats.recordKill(headshot)
    this.creditTeam(this.playerTeam)
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
    this.checkMatchEnd()
  }

  /**
   * A human you shot in multiplayer. Their damage is applied on their own client,
   * so this is the only place the local scoreboard learns about the kill.
   */
  public onNetworkKill(victimName: string, weaponKey: string, headshot: boolean): void {
    this.stats.recordKill(headshot)
    this.creditTeam(this.playerTeam)
    this.renderer.hud?.pushKillFeed({
      killer: this.playerName || 'Player',
      victim: victimName,
      weaponKey,
      headshot,
      isLocal: true,
    })
    this.checkMatchEnd()
  }

  /** Bot killed another bot — always track K; show feed only if you assisted */
  public onBotKilledByBot(killer: TrainingBot, victim: TrainingBot): void {
    this.creditTeam(killer.team)
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
    this.checkMatchEnd()
  }

  public onPlayerDeath(): void {
    this.stats.recordDeath()
    // Friendly fire is off in team play, so the kill always belongs to the other side
    this.creditTeam(this.teamPlay ? otherTeam(this.playerTeam) : null)
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
      bot.team = assignment.botTeams[i] ?? null
      bot.visualModel = 'CsTerrorist'
      bot.addToWorld(this.physics)
      const renderer = new TrainingBotRenderer(bot)
      this.trainingBots.push(bot)
      this.botRenderers.push(renderer)
    }
  }

  public setPhysicsObjects(): void {
    // Maps install later via ensureMap after the player picks one
    this.actors = new Array<CubeCollider>()
    this.mapColliders = []
    this.mapExtras = []
    this.activeMapMesh = null
    this.activeSpawns = []
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
    requestAnimationFrame(this.update)

    const now: number = performance.now()
    let dt = (now - this.lastUpdateTS) / 1000
    this.lastUpdateTS = now
    if (!Number.isFinite(dt) || dt < 0) dt = 0
    if (dt > 0.05) dt = 0.05

    if (this.matchStarted && this.matchPaused) {
      this.renderAcc = 0
      if (this.shouldRenderFrame(now)) this.renderer.update(0)
      return
    }

    this.currentPlayer.player.prestep(dt)

    if (this.matchStarted) {
      if (this.pendingBotSpawns.length > 0) {
        this.botSpawnAcc += dt
        const budget = Math.max(1, Math.floor(this.botSpawnAcc * 10))
        this.botSpawnAcc = 0
        this.flushPendingBots(Math.min(3, budget))
      }

      if (!this.awaitingLoadout && this.lockdownTimer > 0) {
        this.lockdownTimer = Math.max(0, this.lockdownTimer - dt)
        this.renderer.hud?.setLockdown(this.lockdownTimer > 0 ? this.lockdownTimer : null)
        if (this.lockdownTimer <= 0) {
          this.combatLive = true
          this.renderer.hud?.setLockdown(null)
          this.flushPendingBots(8)
        }
      }

      if (this.combatLive && !this.matchOver) {
        this.matchElapsed += dt
        this.checkMatchEnd()
      }
      if (!this.matchOver) this.syncMatchStatus()

      const botsActive = this.combatLive
      for (let i = 0; i < this.trainingBots.length; i++) {
        const bot = this.trainingBots[i]
        if (botsActive || bot.isNetworkPuppet) bot.update(dt)
        this.botRenderers[i]?.update(dt)
      }
      this.multiplayer?.update(dt)
    }

    this.inputManager.update(dt)

    if (this.editorActive) this.editorMenu?.refresh()

    for (let i = 0; i < this.actors.length; i++) {
      this.actors[i].update(dt)
    }

    this.currentPlayer.player.update(dt)
    this.currentPlayer.player.updateDeath(dt)
    this.physics.update(dt)
    this.currentPlayer.player.postPhysics(dt)

    // Hand the renderer every second that passed since the last draw, not just this
    // frame's slice — otherwise a frame cap slows viewmodel / camera animation down to
    // a fraction of real speed while the world keeps running at full rate.
    this.renderAcc += dt
    if (!this.shouldRenderFrame(now)) return
    const renderDt = Math.min(0.05, this.renderAcc)
    this.renderAcc = 0
    this.renderer.update(renderDt)
  }

  private shouldRenderFrame(now: number): boolean {
    if (this.fpsCap <= 0) {
      this.lastFrameTS = now
      return true
    }
    const minInterval = 1000 / this.fpsCap
    if (now - this.lastFrameTS < minInterval - 0.5) return false
    this.lastFrameTS = now
    return true
  }

  public startUpdateLoop() {
    this.lastUpdateTS = performance.now()
    this.lastFrameTS = 0
    this.renderAcc = 0
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
