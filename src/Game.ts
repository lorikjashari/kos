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
import * as THREE from 'three'
import {
  BOT_GROUND_Y,
  DEFAULT_MAP_ID,
  getMapDefinition,
  spawnsFromBounds,
  type MapId,
  type SpawnPoint,
} from './Core/MapCatalog'
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
import { clampSensitivity, loadSettings, saveSettings } from './UI/SettingsStore'

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
  private pendingBotSpawns: Array<{ pos: Vector3D; yaw: number; difficulty: BotDifficulty; name: string }> = []
  private botSpawnAcc = 0
  private effectsWarmed = false
  private combatLive = false
  public stats = new MatchStats()
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
  /** Generic CS-style cvar store for values with no local system yet. */
  private cvars = new Map<string, string>()
  /** 0 = uncapped; otherwise target frames per second for the render loop. */
  private fpsCap = 0
  private lastFrameTS = 0
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

  /** Press ` (backtick) in-game or on the menu to open the CS-style console. */
  public openCommandConsole(): void {
    if (!this.commandConsole) {
      this.commandConsole = new CommandConsole({
        onCommand: (line) => void this.runCommand(line),
        onClose: () => this.onCommandConsoleClosed(),
      })
    }
    if (this.commandConsole.isOpen()) return
    this.consoleResumeGameplay = this.matchStarted && !this.matchPaused && this.inputManager.gameplayEnabled
    this.inputManager.gameplayEnabled = false
    this.inputManager.unlock()
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
      setTimeout(() => this.inputManager.onLock(), 40)
    }
    this.consoleResumeGameplay = false
  }

  /** Wire the in-game crosshair + live settings so the console can tweak them. */
  public attachCrosshair(renderer: CrosshairRenderer, settings: PlayerSettings): void {
    this.crosshairRenderer = renderer
    this.crosshairSettings = settings.crosshair
    this.playerSettings = settings
    this.inputManager.setSensitivity(settings.sensitivity)
  }

  /** Apply mouse look sensitivity (settings + console). Persists to localStorage. */
  public setSensitivity(value: number): number {
    const s = clampSensitivity(value)
    this.inputManager.setSensitivity(s)
    if (this.playerSettings) this.playerSettings.sensitivity = s
    const stored = loadSettings()
    stored.sensitivity = s
    saveSettings(stored)
    return s
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

  /**
   * fps_max: 0 = uncapped (as fast as the display allows), 1..24 clamp up to 24,
   * 25..999 use that exact cap.
   */
  private setFpsCap(n: number): number {
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
        this.conPrint('  sensitivity, disconnect, retry, reconnect, connect, toggleconsole, clear')
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

      // ---- Volume ----
      case 'volume':
        this.audioManager.setSfxVolume(val)
        this.conPrint(`volume ${this.audioManager.getSfxVolume().toFixed(2)}`, 'ok')
        return
      case 'mp3volume':
      case 'bgmvolume':
        this.audioManager.setMusicVolume(val)
        this.conPrint(`${cmd} ${this.audioManager.getMusicVolume().toFixed(2)}`, 'ok')
        return
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

      // ---- FPS cap ----
      case 'fps_max': {
        const cap = this.setFpsCap(val)
        this.conPrint(cap === 0 ? 'fps_max 0 (unlimited)' : `fps_max ${cap}`, 'ok')
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
    this.editorWeapon = 'Usp'
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
      },
      onSelectWeapon: (key) => {
        this.editorWeapon = key
        this.botRenderers[0]?.setWeapon(key)
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

  public startBotMatch(config: BotMatchConfig): void {
    this.lastMatchConfig = config
    this.clearBots()
    this.stats.reset()
    this.playerName = config.playerName || 'Player'
    this.refillAmmoOnKill = !!config.refillAmmoOnKill
    this.matchStarted = true
    this.matchPaused = false
    this.combatLive = false
    this.lockdownTimer = this.lockdownDuration
    this.inputManager.gameplayEnabled = true
    this.applyMapMoveSpeed(this.activeMapId)

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

  /** Load / swap map before match start (Pool Day or Dust II). */
  public async ensureMap(mapId: MapId): Promise<void> {
    if (this.activeMapId === mapId && this.activeMapMesh) return

    const def = getMapDefinition(mapId)
    // Force reload Dust II so earlier white-bleach materials aren't reused
    const mapMesh = await this.globalLoadingManager.loadMapMesh(
      def.meshKey,
      def.glbPath,
      def.usePoolLights,
      def.id === 'de_dust2'
    )

    if (def.normalizeToSize) {
      mapMesh.normalizeForPlay(def.normalizeToSize)
    }

    this.unloadActiveMap()

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

    if (def.id === 'de_dust2' || def.spawns.length <= 1) {
      this.activeSpawns = spawnsFromBounds(
        { x: box.min.x, y: box.min.y, z: box.min.z },
        { x: box.max.x, y: box.max.y, z: box.max.z },
        2.2
      )
      // Prefer a spawn near CT/T mid — center of normalized map
      const mid = this.activeSpawns[0]
      if (mid) {
        // Drop onto ground via short physics ray once world exists
        const from = new Vector3D(mid.x, box.max.y + 20, mid.z)
        const to = new Vector3D(mid.x, box.min.y - 5, mid.z)
        const hit = this.physics.raycast(from, to)
        if (hit.hasHit && hit.hitPosition) {
          mid.y = hit.hitPosition.y + 2.0
          for (const s of this.activeSpawns) {
            if (s === mid) continue
            const h2 = this.physics.raycast(
              new Vector3D(s.x, box.max.y + 20, s.z),
              new Vector3D(s.x, box.min.y - 5, s.z)
            )
            if (h2.hasHit && h2.hitPosition) s.y = h2.hitPosition.y + 2.0
          }
        }
      }
    } else {
      this.activeSpawns = def.spawns
    }

    this.activeMapId = mapId
    this.mapName = mapId
    this.applyMapMoveSpeed(mapId)
  }

  private applyMapMoveSpeed(mapId: MapId): void {
    const scale = getMapDefinition(mapId).moveSpeedScale ?? 1
    this.currentPlayer?.player.setMapSpeedScale(scale)
  }

  private unloadActiveMap(): void {
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
    this.activeMapMesh = null
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
    this.teardownEditorTools()
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

    for (let i = 0; i < this.activeSpawns.length; i++) {
      const s = this.activeSpawns[i]
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
      const s = this.activeSpawns[r.idx]
      return occupied.every((o) => flatDistXZ(s.x, s.z, o.x, o.z) >= minClear)
    })
    const pick = clear ?? ranked[0]
    const s = this.activeSpawns[pick?.idx ?? 0] ?? { x: 0, y: 2, z: 0 }
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
      bot.visualModel = 'CsTerrorist'
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
      bot.visualModel = 'CsTerrorist'
      bot.addToWorld(this.physics)
      const renderer = new TrainingBotRenderer(bot)
      this.trainingBots.push(bot)
      this.botRenderers.push(renderer)
    }
  }

  public setPhysicsObjects(): void {
    this.actors = new Array<CubeCollider>()
    // Pool Day is already loaded at boot — install it synchronously
    const def = getMapDefinition('pool_day')
    const mapMesh = this.globalLoadingManager.loadableMeshs.get(def.meshKey) as MapMesh | undefined
    if (!mapMesh) {
      throw new Error('Map mesh failed to load. Check that pool_day_baked.glb exists in public/.')
    }
    mapMesh.init()
    const extras: THREE.Object3D[] = []
    const actorStart = this.actors.length
    mapMesh.addPhysics(this, { usePoolLights: true, extras })
    this.mapColliders = this.actors.slice(actorStart)
    this.mapExtras = extras
    this.activeMapMesh = mapMesh
    this.activeMapId = 'pool_day'
    this.mapName = 'pool_day'
    this.activeSpawns = def.spawns
    this.addToRenderer(mapMesh.mesh)
    this.spawnDebugCubes()
    this.applyMapMoveSpeed('pool_day')
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
    // Always queue the next animation frame first so early returns still loop.
    requestAnimationFrame(this.update)

    const now: number = performance.now()

    // fps_max: skip this frame if we're ahead of the target interval.
    if (this.fpsCap > 0) {
      const minInterval = 1000 / this.fpsCap
      if (now - this.lastFrameTS < minInterval - 1) return
    }
    this.lastFrameTS = now

    // Cap dt so physics stays stable; allow a bigger step when fps_max is low
    // (otherwise a 24 fps cap would run the sim in slow motion).
    const maxDt = this.fpsCap > 0 ? Math.min(0.1, 1 / this.fpsCap + 0.005) : 0.02
    let dt = (now - this.lastUpdateTS) / 1000
    dt = Math.min(maxDt, dt)
    this.currentPlayer.player.prestep(dt)

    if (this.matchStarted) {
      if (this.matchPaused) {
        this.renderer.update(0)
        this.lastUpdateTS = now
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

    if (this.editorActive) this.editorMenu?.refresh()

    for (let i = 0; i < this.actors.length; i++) {
      this.actors[i].update(dt)
    }

    this.currentPlayer.player.update(dt)
    this.currentPlayer.player.updateDeath(dt)
    this.physics.update(dt)
    this.renderer.update(dt)
    this.lastUpdateTS = now
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
