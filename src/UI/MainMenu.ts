import type { BotDifficulty } from '../Core/TrainingBot'
import { DEFAULT_MAP_ID, getMapDefinition, type MapId } from '../Core/MapCatalog'
import {
  DEFAULT_CROSSHAIR,
  DEFAULT_KEYBINDS,
  DEFAULT_MOBILE_LAYOUT,
  formatKeyLabel,
  loadSettings,
  MOBILE_CONTROL_META,
  normalizeMobileSettings,
  REBINDABLE_ACTIONS,
  RESOLUTION_PRESETS,
  resolutionKey,
  saveSettings,
  type AspectGroup,
  type CrosshairSettings,
  type MobileControlId,
  type PlayerSettings,
} from './SettingsStore'
import { CrosshairRenderer } from './CrosshairRenderer'
import { Key } from '../Input/KeyBinding'
import { Game } from '../Game'
import type { MobileControls } from './MobileControls'
import { isTouchDevice } from './MobileDevice'
import type { MobileHoldMode, MobilePerfProfile } from './SettingsStore'
import { roomDirectory, type PublicRoomInfo } from '../Net/RoomDirectory'

export type BotMatchConfig = {
  difficulty: BotDifficulty
  botCount: number
  playerName: string
  /** Instantly refill mag to full after each bot kill */
  refillAmmoOnKill: boolean
  /** Selected arena */
  mapId: MapId
}

type MenuCallbacks = {
  onPlayBots: (config: BotMatchConfig) => void
  onPlayMultiplayer: (config: {
    mode: 'host' | 'join'
    roomCode?: string
    playerName: string
    difficulty: BotDifficulty
    botCount: number
  }) => void
  onSettingsChanged: (settings: PlayerSettings) => void
}

/**
 * Full-screen KoS menu: loading → main → bots / settings.
 * Advanced but clear UX — one job per screen.
 */
export class MainMenu {
  private root: HTMLElement
  private settings: PlayerSettings
  private callbacks: MenuCallbacks
  private crosshairPreview!: CrosshairRenderer
  private gameCrosshair!: CrosshairRenderer
  private listeningKey: Key | null = null
  private selectedDifficulty: BotDifficulty = 'medium'
  private selectedBotCount = 5
  private selectedMapId: MapId = DEFAULT_MAP_ID
  private currentScreen: 'loading' | 'main' | 'bots' | 'mp' | 'settings' = 'loading'
  private mobileControls: MobileControls | null = null
  private editingMobileLayout = false
  private selectedMobileId: MobileControlId | null = null
  private dockDrag: { pointerId: number; ox: number; oy: number; x: number; y: number } | null = null
  private displayHz = 60
  private watchingRooms = false

  constructor(callbacks: MenuCallbacks) {
    this.callbacks = callbacks
    this.settings = loadSettings()
    document.getElementById('kos-menu')?.remove()
    this.ensureStyles()
    this.root = document.createElement('div')
    this.root.id = 'kos-menu'
    this.root.innerHTML = this.buildHtml()
    document.body.appendChild(this.root)
    this.bind()
    this.applyDeviceUi()
    this.applyCrosshairToGame()
    this.showScreen('loading')
  }

  private applyDeviceUi(): void {
    const mobile = isTouchDevice()
    this.root.classList.toggle('is-desktop', !mobile)
    this.root.classList.toggle('is-mobile-ui', mobile)
  }

  private readSafeInset(side: 'top' | 'right' | 'bottom' | 'left'): number {
    const probe = document.createElement('div')
    probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding-${side}:env(safe-area-inset-${side});`
    document.body.appendChild(probe)
    const val = parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${side}`)) || 0
    probe.remove()
    return val
  }

  private selectSettingsTab(tab: string): void {
    this.root.querySelectorAll('.kos-tab').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-tab') === tab)
    })
    this.root.querySelectorAll('.kos-tab-panel').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-panel') === tab)
    })
    if (tab === 'mobile') this.syncMobileControlsPanel()
  }

  public getSettings(): PlayerSettings {
    return this.settings
  }

  public setMobileControls(controls: MobileControls): void {
    this.mobileControls = controls
  }

  /** In-game crosshair renderer (for the console to tweak live). */
  public getGameCrosshair(): CrosshairRenderer {
    return this.gameCrosshair
  }

  public setLoadingProgress(label: string, pct: number): void {
    const bar = this.root.querySelector('.kos-load-fill') as HTMLElement | null
    const text = this.root.querySelector('.kos-load-label') as HTMLElement | null
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`
    if (text) text.textContent = label
  }

  public showMain(): void {
    this.showScreen('main')
  }

  public showError(message: string): void {
    this.setLoadingProgress('Failed to load', 100)
    const err = this.root.querySelector('.kos-load-error') as HTMLElement | null
    if (err) {
      err.textContent = message
      err.hidden = false
    }
  }

  public hide(): void {
    this.stopMobileLayoutEdit()
    this.stopMenuAudio()
    this.stopRoomWatch()
    this.root.classList.add('is-hidden')
    this.root.setAttribute('aria-hidden', 'true')
    // Match start will sync via GameHUD; still force the canvas ready now
    const xhair = document.getElementById('game-crosshair') as HTMLCanvasElement | null
    if (xhair) {
      if (xhair.parentElement !== document.body) document.body.appendChild(xhair)
      xhair.classList.add('is-on')
      xhair.classList.remove('is-awp-hidden')
      xhair.style.setProperty('position', 'fixed', 'important')
      xhair.style.setProperty('left', '50%', 'important')
      xhair.style.setProperty('top', '50%', 'important')
      xhair.style.setProperty('width', '48px', 'important')
      xhair.style.setProperty('height', '48px', 'important')
      xhair.style.setProperty('transform', 'translate(-50%, -50%)', 'important')
      xhair.style.setProperty('z-index', '10000', 'important')
      xhair.style.setProperty('opacity', '1', 'important')
      xhair.style.setProperty('visibility', 'visible', 'important')
      xhair.style.setProperty('display', 'block', 'important')
      xhair.style.setProperty('pointer-events', 'none', 'important')
      xhair.style.setProperty('background', 'transparent', 'important')
    }
    this.gameCrosshair?.resize()
  }

  public show(): void {
    this.root.classList.remove('is-hidden')
    this.root.setAttribute('aria-hidden', 'false')
    const xhair = document.getElementById('game-crosshair') as HTMLElement | null
    if (xhair) {
      xhair.classList.remove('is-on')
      xhair.classList.add('is-awp-hidden')
      xhair.style.setProperty('opacity', '0', 'important')
      xhair.style.setProperty('visibility', 'hidden', 'important')
      xhair.style.setProperty('display', 'none', 'important')
    }
    this.showScreen('main')
  }

  public showScreen(id: 'loading' | 'main' | 'bots' | 'mp' | 'settings'): void {
    this.currentScreen = id
    this.root.querySelectorAll('.kos-screen').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-screen') === id)
    })
    this.root.classList.toggle('is-bg-blur', id !== 'main')
    this.syncMenuMusic()
    if (id === 'mp') this.startRoomWatch()
    else this.stopRoomWatch()
    if (id === 'settings') {
      this.renderKeybindList()
      this.syncCrosshairControls()
      this.syncSensitivityControl()
      this.renderResolutionGroups()
      this.syncMobileControlsPanel()
      this.syncFpsControls()
      this.crosshairPreview?.draw()
      if (isTouchDevice()) this.selectSettingsTab('mobile')
      else this.selectSettingsTab('video')
    } else {
      this.stopMobileLayoutEdit()
    }
  }

  private audio() {
    try {
      return Game.getInstance().audioManager
    } catch {
      return null
    }
  }

  private syncMenuMusic(): void {
    const audio = this.audio()
    if (!audio) return
    if (this.currentScreen === 'loading' || this.root.classList.contains('is-hidden')) {
      audio.stopMenuMusic()
      return
    }
    void audio.startMenuMusic()
  }

  private stopMenuAudio(): void {
    this.audio()?.stopMenuMusic()
  }

  private playHover(): void {
    this.audio()?.playMenuHover()
  }

  private buildHtml(): string {
    return `
      <div class="kos-bg" aria-hidden="true">
        <img class="kos-bg-art" src="/mainmenubackground.jpg" alt="" draggable="false" />
        <div class="kos-bg-veil"></div>
        <div class="kos-bg-vignette"></div>
      </div>

      <section class="kos-screen is-active" data-screen="loading">
        <div class="kos-load">
          <img class="kos-logo kos-logo-load" src="/logo.png" alt="KoS FPS Shooting" width="420" height="420" />
          <div class="kos-load-wrap">
            <div class="kos-load-track"><div class="kos-load-fill"></div></div>
            <p class="kos-load-label">Loading…</p>
            <p class="kos-load-error" hidden></p>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="main">
        <div class="kos-shell kos-shell-main">
          <div class="kos-hero">
            <img class="kos-logo kos-logo-hero" src="/logo.png" alt="KoS FPS Shooting" width="640" height="640" />
          </div>

          <div class="kos-menu-rail">
            <label class="kos-field">
              <span>Your Name</span>
              <input id="kos-name" type="text" maxlength="24" placeholder="Enter name" autocomplete="off" spellcheck="false" />
            </label>

            <nav class="kos-nav">
              <button type="button" class="kos-btn kos-btn-primary" data-action="bots">
                <span class="kos-btn-label">Play with Bots</span>
              </button>
              <button type="button" class="kos-btn kos-btn-ghost-line" data-action="mp">
                <span class="kos-btn-label">Multiplayer</span>
              </button>
              <button type="button" class="kos-btn kos-btn-ghost-line" data-action="settings">
                <span class="kos-btn-label">Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="mp">
        <div class="kos-shell kos-shell-sub">
          <button type="button" class="kos-back" data-action="back-main">← Back</button>
          <h2 class="kos-heading">Multiplayer</h2>

          <div class="kos-section-label">Open rooms</div>
          <div class="kos-mp-rooms" id="kos-mp-rooms">
            <div class="kos-mp-rooms-empty" id="kos-mp-rooms-empty">Looking for rooms…</div>
          </div>

          <label class="kos-field kos-field-inline">
            <span>Bots</span>
            <input id="kos-mp-bot-count" type="number" min="0" max="10" step="1" value="10" inputmode="numeric" />
          </label>

          <div class="kos-chip-row" id="kos-mp-diff">
            <button type="button" class="kos-chip" data-mp-diff="easy">Easy</button>
            <button type="button" class="kos-chip is-on" data-mp-diff="medium">Medium</button>
            <button type="button" class="kos-chip" data-mp-diff="hard">Hard</button>
          </div>

          <button type="button" class="kos-btn kos-btn-primary kos-start" data-action="mp-host">
            <span class="kos-btn-label">Create Room</span>
          </button>

          <div class="kos-mp-or">or code</div>

          <label class="kos-field">
            <input id="kos-mp-code" type="text" maxlength="8" placeholder="Room code" autocomplete="off" spellcheck="false" style="text-transform:uppercase;letter-spacing:0.14em;font-weight:800" />
          </label>
          <button type="button" class="kos-btn kos-btn-ghost-line kos-start" data-action="mp-join">
            <span class="kos-btn-label">Join</span>
          </button>
          <p class="kos-hint" id="kos-mp-status"></p>
        </div>
      </section>

      <section class="kos-screen" data-screen="bots">
        <div class="kos-shell kos-shell-sub">
          <button type="button" class="kos-back" data-action="back-main">← Back</button>
          <div class="kos-sub-brand">
            <img class="kos-logo kos-logo-sm" src="/logo.png" alt="KoS" width="180" height="180" />
          </div>
          <h2 class="kos-heading">Play with Bots</h2>
          <p class="kos-hint">Pick a map, difficulty, and how many bots spawn.</p>

          <div class="kos-section-label">Map</div>
          <div class="kos-chip-row" id="kos-map">
            <button type="button" class="kos-chip is-on" data-map="pool_day">Pool Day</button>
            <button type="button" class="kos-chip" data-map="de_dust2">Dust II</button>
          </div>
          <p class="kos-hint tight-left" id="kos-map-hint">Classic pool arena — bots ready.</p>

          <div class="kos-section-label">Difficulty</div>
          <div class="kos-chip-row" id="kos-diff">
            <button type="button" class="kos-chip" data-diff="easy">Easy</button>
            <button type="button" class="kos-chip is-on" data-diff="medium">Medium</button>
            <button type="button" class="kos-chip" data-diff="hard">Hard</button>
          </div>

          <label class="kos-field kos-field-inline">
            <span>How many bots</span>
            <input id="kos-bot-count" type="number" min="0" max="10" step="1" value="5" inputmode="numeric" />
          </label>
          <p class="kos-hint tight-left">Type any amount (0–10). Dust II starts at 0 while we tune it.</p>

          <label class="kos-check kos-match-opt">
            <input id="kos-refill-kill" type="checkbox" />
            <span>
              <strong>Refill ammo on kill</strong>
              <em>After each kill, mag goes full instantly (e.g. 30)</em>
            </span>
          </label>

          <button type="button" class="kos-btn kos-btn-primary kos-start" data-action="start-bots">
            <span class="kos-btn-label">Start Match</span>
          </button>
        </div>
      </section>

      <section class="kos-screen" data-screen="settings">
        <div class="kos-shell kos-shell-sub kos-shell-settings">
          <button type="button" class="kos-back" data-action="back-main">← Back</button>
          <div class="kos-sub-brand">
            <img class="kos-logo kos-logo-sm" src="/logo.png" alt="KoS" width="180" height="180" />
          </div>
          <h2 class="kos-heading">Settings</h2>

            <div class="kos-tabs" role="tablist">
            <button type="button" class="kos-tab is-on" data-tab="video">Video</button>
            <button type="button" class="kos-tab" data-tab="crosshair">Crosshair</button>
            <button type="button" class="kos-tab" data-tab="keybinds" data-desktop-only>Keybinds</button>
            <button type="button" class="kos-tab" data-tab="mobile" data-mobile-only>Mobile</button>
          </div>

          <div class="kos-tab-panel is-on" data-panel="video">
            <p class="kos-hint" data-desktop-only>Render resolution is stretched to fill your screen (CS-style). Switching aspect (4:3 ↔ 16:9) changes the stretch.</p>
            <p class="kos-hint" data-mobile-only>Native display resolution is used on mobile. Frame rate and Performance control smoothness.</p>
            <p class="kos-hint tight" id="kos-res-active" data-desktop-only>Active: 1280×960</p>
            <div class="kos-res-groups" id="kos-res-groups" data-desktop-only></div>
            <p class="kos-section-label" style="margin-top:18px" data-desktop-only>Graphics</p>
            <div class="kos-chip-row" id="kos-gfx-row" data-desktop-only>
              <button type="button" class="kos-chip" data-gfx="low">Low</button>
              <button type="button" class="kos-chip" data-gfx="medium">Medium</button>
              <button type="button" class="kos-chip" data-gfx="high">High</button>
            </div>
            <p class="kos-section-label" style="margin-top:18px">Frame rate</p>
            <p class="kos-hint tight" id="kos-fps-hint">Auto matches your display refresh.</p>
            <div class="kos-chip-row" id="kos-fps-row">
              <button type="button" class="kos-chip" data-fps="0">Auto</button>
              <button type="button" class="kos-chip" data-fps="60">60</button>
              <button type="button" class="kos-chip" data-fps="120" data-mobile-only>120</button>
              <button type="button" class="kos-chip" data-fps="120" data-desktop-only>120</button>
              <button type="button" class="kos-chip" data-fps="144" data-desktop-only>144</button>
              <button type="button" class="kos-chip" data-fps="999" data-desktop-only>Unlimited</button>
            </div>
          </div>

          <div class="kos-tab-panel" data-panel="crosshair">
            <div class="kos-xhair-preview-wrap">
              <canvas id="kos-xhair-preview" width="120" height="120"></canvas>
              <p class="kos-hint tight">Live preview</p>
            </div>
            <div class="kos-xhair-controls" id="kos-xhair-controls"></div>
            <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-xhair">Reset Crosshair</button>
          </div>

          <div class="kos-tab-panel" data-panel="keybinds" data-desktop-only>
            <p class="kos-hint">Click a bind, then press a new key. Esc cancels.</p>
            <label class="kos-slider kos-sens-slider">
              <span>Mouse Sensitivity<em id="kos-sens-val">3</em></span>
              <input id="kos-sensitivity" type="range" min="0.1" max="10" step="0.05" value="3" />
            </label>
            <label class="kos-check kos-match-opt">
              <input id="kos-jump-wheel" type="checkbox" />
              <span>
                <strong>Jump with mouse wheel</strong>
                <em>Scroll up or down to jump (CS-style)</em>
              </span>
            </label>
            <div class="kos-bind-list" id="kos-bind-list"></div>
            <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-binds">Reset Keybinds</button>
          </div>

          <div class="kos-tab-panel" data-panel="mobile" data-mobile-only>
            <div class="kos-mset">
              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Performance</strong>
                  <em>Smooth keeps 120Hz devices playable</em>
                </div>
                <div class="kos-seg" data-seg="perfProfile">
                  <button type="button" data-perf="smooth">Smooth</button>
                  <button type="button" data-perf="balanced">Balanced</button>
                  <button type="button" data-perf="quality">Quality</button>
                </div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Touch look</strong>
                  <em>Drag empty space to aim</em>
                </div>
                <label class="kos-slider">
                  <span>Look sensitivity<em id="kos-mobile-look-val">1.15</em></span>
                  <input id="kos-mobile-look" type="range" min="0.2" max="3" step="0.05" value="1.15" />
                </label>
                <label class="kos-slider">
                  <span>Stick deadzone<em id="kos-mobile-dead-val">0.18</em></span>
                  <input id="kos-mobile-dead" type="range" min="0.05" max="0.45" step="0.01" value="0.18" />
                </label>
                <label class="kos-check kos-match-opt">
                  <input id="kos-mobile-enabled" type="checkbox" />
                  <span>
                    <strong>On-screen controls</strong>
                    <em>Joystick + action buttons</em>
                  </span>
                </label>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Crouch</strong>
                  <em>Hold or tap-toggle</em>
                </div>
                <div class="kos-seg" data-seg="crouchMode">
                  <button type="button" data-hold="hold">Hold</button>
                  <button type="button" data-hold="toggle">Toggle</button>
                </div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Lean / tilt</strong>
                  <em>Hold or tap-toggle left & right</em>
                </div>
                <div class="kos-seg" data-seg="leanMode">
                  <button type="button" data-hold="hold">Hold</button>
                  <button type="button" data-hold="toggle">Toggle</button>
                </div>
              </div>

              <div class="kos-mset-card">
                <div class="kos-mset-head">
                  <strong>Button layout</strong>
                  <em>Standoff-style drag editor</em>
                </div>
                <div class="kos-mobile-editor-actions">
                  <button type="button" class="kos-btn kos-btn-primary" data-action="edit-mobile-layout">Edit Layout</button>
                  <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-mobile-layout">Reset</button>
                </div>
                <div class="kos-mobile-list" id="kos-mobile-list"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="kos-mobile-dock" id="kos-mobile-slot-panel" hidden>
        <div class="kos-mobile-dock-grip" data-dock-drag="1">
          <span class="kos-mobile-dock-bars"></span>
          <em>Drag</em>
        </div>
        <div class="kos-mobile-dock-top">
          <strong id="kos-mobile-slot-name">—</strong>
          <button type="button" class="kos-mobile-done" data-action="done-mobile-layout">Done</button>
        </div>
        <label class="kos-slider kos-mobile-dock-slider">
          <span>Size<em id="kos-mobile-size-val">1</em></span>
          <input id="kos-mobile-size" type="range" min="0.55" max="1.8" step="0.05" value="1" />
        </label>
        <label class="kos-slider kos-mobile-dock-slider">
          <span>Opacity<em id="kos-mobile-opacity-val">0.6</em></span>
          <input id="kos-mobile-opacity" type="range" min="0.15" max="1" step="0.05" value="0.6" />
        </label>
        <label class="kos-check kos-mobile-dock-check">
          <input id="kos-mobile-visible" type="checkbox" checked />
          <span>Visible</span>
        </label>
      </div>
    `
  }

  public syncFpsControls(displayHz?: number): void {
    if (typeof displayHz === 'number' && Number.isFinite(displayHz)) this.displayHz = displayHz
    const hint = this.root.querySelector('#kos-fps-hint')
    if (hint) {
      hint.textContent =
        this.displayHz >= 110
          ? `Display ~${this.displayHz}Hz — Auto unlocks high refresh on this device.`
          : `Display ~${this.displayHz}Hz — Auto matches your screen refresh.`
    }
    const v = this.settings.fpsMax
    const current = v === 60 || v === 120 || v === 144 || v === 999 ? v : 0
    this.root.querySelectorAll('[data-fps]').forEach((el) => {
      el.classList.toggle('is-on', Number((el as HTMLElement).getAttribute('data-fps')) === current)
    })
  }

  private bind(): void {
    const nameInput = this.root.querySelector('#kos-name') as HTMLInputElement
    nameInput.value = this.settings.playerName
    nameInput.addEventListener('input', () => {
      this.settings.playerName = nameInput.value.trim().slice(0, 24)
      this.persist()
    })

    const jumpWheel = this.root.querySelector('#kos-jump-wheel') as HTMLInputElement | null
    if (jumpWheel) {
      jumpWheel.checked = !!this.settings.jumpWithScrollWheel
      jumpWheel.addEventListener('change', () => {
        this.settings.jumpWithScrollWheel = jumpWheel.checked
        this.persist()
      })
    }

    const sensInput = this.root.querySelector('#kos-sensitivity') as HTMLInputElement | null
    const sensVal = this.root.querySelector('#kos-sens-val')
    if (sensInput) {
      sensInput.value = String(this.settings.sensitivity)
      if (sensVal) sensVal.textContent = String(this.settings.sensitivity)
      sensInput.addEventListener('input', () => {
        const v = Number(sensInput.value)
        this.settings.sensitivity = Number.isFinite(v) ? Math.round(v * 100) / 100 : 3
        if (sensVal) sensVal.textContent = String(this.settings.sensitivity)
        this.persist()
      })
    }

    this.settings.mobile = normalizeMobileSettings(this.settings.mobile)
    const mobileEnabled = this.root.querySelector('#kos-mobile-enabled') as HTMLInputElement | null
    if (mobileEnabled) {
      mobileEnabled.checked = this.settings.mobile.enabled
      mobileEnabled.addEventListener('change', () => {
        this.settings.mobile.enabled = mobileEnabled.checked
        this.persist()
      })
    }
    const lookInput = this.root.querySelector('#kos-mobile-look') as HTMLInputElement | null
    const lookVal = this.root.querySelector('#kos-mobile-look-val')
    if (lookInput) {
      lookInput.value = String(this.settings.mobile.lookSensitivity)
      if (lookVal) lookVal.textContent = String(this.settings.mobile.lookSensitivity)
      lookInput.addEventListener('input', () => {
        const v = Number(lookInput.value)
        this.settings.mobile.lookSensitivity = Number.isFinite(v) ? Math.round(v * 100) / 100 : 1.15
        if (lookVal) lookVal.textContent = String(this.settings.mobile.lookSensitivity)
        this.persist()
      })
    }
    const deadInput = this.root.querySelector('#kos-mobile-dead') as HTMLInputElement | null
    const deadVal = this.root.querySelector('#kos-mobile-dead-val')
    if (deadInput) {
      deadInput.value = String(this.settings.mobile.joystickDeadzone)
      if (deadVal) deadVal.textContent = String(this.settings.mobile.joystickDeadzone)
      deadInput.addEventListener('input', () => {
        const v = Number(deadInput.value)
        this.settings.mobile.joystickDeadzone = Number.isFinite(v) ? Math.round(v * 100) / 100 : 0.18
        if (deadVal) deadVal.textContent = String(this.settings.mobile.joystickDeadzone)
        this.persist()
      })
    }
    const sizeInput = this.root.querySelector('#kos-mobile-size') as HTMLInputElement | null
    const sizeVal = this.root.querySelector('#kos-mobile-size-val')
    sizeInput?.addEventListener('input', () => {
      if (!this.selectedMobileId) return
      const v = Number(sizeInput.value)
      const size = Number.isFinite(v) ? v : 1
      if (sizeVal) sizeVal.textContent = String(size)
      this.settings.mobile.layout[this.selectedMobileId].size = size
      this.mobileControls?.updateSelectedSlot({ size })
      this.persist()
    })
    const opacityInput = this.root.querySelector('#kos-mobile-opacity') as HTMLInputElement | null
    const opacityVal = this.root.querySelector('#kos-mobile-opacity-val')
    opacityInput?.addEventListener('input', () => {
      if (!this.selectedMobileId) return
      const v = Number(opacityInput.value)
      const opacity = Number.isFinite(v) ? v : 0.6
      if (opacityVal) opacityVal.textContent = String(opacity)
      this.settings.mobile.layout[this.selectedMobileId].opacity = opacity
      this.mobileControls?.updateSelectedSlot({ opacity })
      this.persist()
    })
    const visibleInput = this.root.querySelector('#kos-mobile-visible') as HTMLInputElement | null
    visibleInput?.addEventListener('change', () => {
      if (!this.selectedMobileId || !visibleInput) return
      this.settings.mobile.layout[this.selectedMobileId].visible = visibleInput.checked
      this.mobileControls?.updateSelectedSlot({ visible: visibleInput.checked })
      this.persist()
      this.renderMobileList()
    })

    this.root.addEventListener('dragstart', (e) => {
      if ((e.target as HTMLElement).closest('.kos-bg')) e.preventDefault()
    })

    this.root.addEventListener(
      'pointerenter',
      (e) => {
        const t = (e.target as HTMLElement).closest(
          'button.kos-btn, button.kos-chip, button.kos-tab, button.kos-back, button.kos-bind, button.kos-res'
        ) as HTMLButtonElement | null
        if (!t || t.disabled) return
        this.playHover()
      },
      true
    )

    this.bindDockDrag()

    this.root.addEventListener('click', (e) => {
      const roomBtn = (e.target as HTMLElement).closest('[data-join-code]') as HTMLElement | null
      if (roomBtn) {
        const code = (roomBtn.getAttribute('data-join-code') || '').trim().toUpperCase()
        if (code) this.startMultiplayer('join', code)
        return
      }

      const t = (e.target as HTMLElement).closest(
        '[data-action], [data-diff], [data-mp-diff], [data-tab], [data-map], [data-res], [data-mobile-id], [data-fps], [data-hold], [data-perf], [data-gfx]'
      ) as HTMLElement | null
      if (!t) return

      const action = t.getAttribute('data-action')
      if (action === 'bots') this.showScreen('bots')
      if (action === 'mp') this.showScreen('mp')
      if (action === 'settings') this.showScreen('settings')
      if (action === 'back-main') this.showScreen('main')
      if (action === 'start-bots') this.startBots()
      if (action === 'mp-host') this.startMultiplayer('host')
      if (action === 'mp-join') this.startMultiplayer('join')
      if (action === 'reset-xhair') {
        this.settings.crosshair = { ...DEFAULT_CROSSHAIR }
        this.settings.crosshair.style = 2
        this.syncCrosshairControls()
        this.crosshairPreview.setSettings(this.settings.crosshair)
        this.applyCrosshairToGame()
        this.persist()
      }
      if (action === 'reset-binds') {
        this.settings.keybinds = { ...DEFAULT_KEYBINDS }
        this.renderKeybindList()
        this.persist()
        this.callbacks.onSettingsChanged(this.settings)
      }
      if (action === 'edit-mobile-layout') this.startMobileLayoutEdit()
      if (action === 'done-mobile-layout') this.stopMobileLayoutEdit()
      if (action === 'reset-mobile-layout') {
        this.settings.mobile.layout = { ...DEFAULT_MOBILE_LAYOUT }
        this.mobileControls?.applySettings(this.settings.mobile)
        this.mobileControls?.resetLayout()
        this.persist()
        this.syncMobileControlsPanel()
      }

      const fpsAttr = t.getAttribute('data-fps')
      if (fpsAttr !== null) {
        const fps = Number(fpsAttr)
        this.settings.fpsMax =
          fps === 60 || fps === 120 || fps === 144 || fps === 999 ? fps : 0
        try {
          Game.getInstance().setFpsCap(this.settings.fpsMax === 999 ? 0 : this.settings.fpsMax)
        } catch {
          /* game may not exist yet */
        }
        this.syncFpsControls()
        this.persist()
      }

      const holdSeg = t.closest('[data-seg="crouchMode"], [data-seg="leanMode"]') as HTMLElement | null
      const holdMode = t.getAttribute('data-hold') as MobileHoldMode | null
      if (holdSeg && (holdMode === 'hold' || holdMode === 'toggle')) {
        const seg = holdSeg.getAttribute('data-seg')
        if (seg === 'crouchMode') this.settings.mobile.crouchMode = holdMode
        if (seg === 'leanMode') this.settings.mobile.leanMode = holdMode
        this.syncMobileModeSegs()
        this.persist()
      }

      const perf = t.getAttribute('data-perf') as MobilePerfProfile | null
      if (perf === 'smooth' || perf === 'balanced' || perf === 'quality') {
        this.settings.mobile.perfProfile = perf
        this.syncMobileModeSegs()
        this.persist()
        try {
          Game.getInstance().applyMobilePerfProfile(perf)
        } catch {
          /* ignore */
        }
      }

      const res = t.getAttribute('data-res')
      if (res) {
        const [ws, hs] = res.split('x')
        const w = Number(ws)
        const h = Number(hs)
        if (Number.isFinite(w) && Number.isFinite(h)) {
          this.settings.resolutionWidth = w
          this.settings.resolutionHeight = h
          this.renderResolutionGroups()
          this.persist()
          try {
            Game.getInstance().applyResolution(w, h)
          } catch {
            /* ignore */
          }
        }
      }

      const gfx = t.getAttribute('data-gfx') as 'low' | 'medium' | 'high' | null
      if (gfx === 'low' || gfx === 'medium' || gfx === 'high') {
        this.settings.graphicsQuality = gfx
        this.syncGraphicsControls()
        this.persist()
        try {
          Game.getInstance().applyGraphicsQuality(gfx)
        } catch {
          /* ignore */
        }
      }

      const mapId = t.getAttribute('data-map') as MapId | null
      if (mapId === 'pool_day' || mapId === 'de_dust2') {
        this.selectMap(mapId)
        this.root.querySelectorAll('[data-map]').forEach((el) => el.classList.toggle('is-on', el === t))
      }

      const diff = t.getAttribute('data-diff') as BotDifficulty | null
      if (diff) {
        this.selectedDifficulty = diff
        this.root.querySelectorAll('[data-diff]').forEach((el) => el.classList.toggle('is-on', el === t))
      }

      const mpDiff = t.getAttribute('data-mp-diff') as BotDifficulty | null
      if (mpDiff) {
        this.selectedDifficulty = mpDiff
        this.root.querySelectorAll('[data-mp-diff]').forEach((el) => el.classList.toggle('is-on', el === t))
      }

      const tab = t.getAttribute('data-tab')
      if (tab) {
        if (tab !== 'mobile') this.stopMobileLayoutEdit()
        this.root.querySelectorAll('.kos-tab').forEach((el) => el.classList.toggle('is-on', el === t))
        this.root.querySelectorAll('.kos-tab-panel').forEach((el) => {
          el.classList.toggle('is-on', el.getAttribute('data-panel') === tab)
        })
        if (tab === 'mobile') this.syncMobileControlsPanel()
      }

      const mobilePick = t.getAttribute('data-mobile-id') as MobileControlId | null
      if (mobilePick) {
        this.selectedMobileId = mobilePick
        this.mobileControls?.selectControl(mobilePick)
        this.syncSelectedMobileSlot()
      }
    })

    const botCountInput = this.root.querySelector('#kos-bot-count') as HTMLInputElement | null
    botCountInput?.addEventListener('change', () => {
      this.selectedBotCount = this.readBotCount()
      botCountInput.value = String(this.selectedBotCount)
    })

    const previewCanvas = this.root.querySelector('#kos-xhair-preview') as HTMLCanvasElement
    this.crosshairPreview = new CrosshairRenderer(previewCanvas, this.settings.crosshair)
    this.buildCrosshairControls()

    // Game crosshair canvas (hidden until match)
    let gameCanvas = document.getElementById('game-crosshair') as HTMLCanvasElement | null
    if (!gameCanvas) {
      gameCanvas = document.createElement('canvas')
      gameCanvas.id = 'game-crosshair'
      document.body.appendChild(gameCanvas)
    }
    this.gameCrosshair = new CrosshairRenderer(gameCanvas, this.settings.crosshair, 48)
    window.addEventListener('resize', () => {
      this.crosshairPreview.resize()
      this.gameCrosshair.resize()
    })
  }

  private selectMap(mapId: MapId): void {
    this.selectedMapId = mapId
    const def = getMapDefinition(mapId)
    this.selectedBotCount = def.defaultBotCount
    const botCountInput = this.root.querySelector('#kos-bot-count') as HTMLInputElement | null
    if (botCountInput) botCountInput.value = String(this.selectedBotCount)
    const hint = this.root.querySelector('#kos-map-hint')
    if (hint) {
      hint.textContent =
        mapId === 'de_dust2'
          ? 'Dust II — no bots yet while we tune collision & spawns.'
          : 'Classic pool arena — bots ready.'
    }
  }

  private readBotCount(): number {
    const input = this.root.querySelector('#kos-bot-count') as HTMLInputElement | null
    const raw = Number(input?.value)
    if (!Number.isFinite(raw)) return getMapDefinition(this.selectedMapId).defaultBotCount
    return Math.max(0, Math.min(10, Math.round(raw)))
  }

  private startBots(): void {
    const name = (this.root.querySelector('#kos-name') as HTMLInputElement).value.trim().slice(0, 24)
    this.settings.playerName = name || 'Player'
    this.selectedBotCount = this.readBotCount()
    const refill = !!(this.root.querySelector('#kos-refill-kill') as HTMLInputElement | null)?.checked
    this.persist()
    this.stopMenuAudio()
    this.callbacks.onPlayBots({
      difficulty: this.selectedDifficulty,
      botCount: this.selectedBotCount,
      playerName: this.settings.playerName,
      refillAmmoOnKill: refill,
      mapId: this.selectedMapId,
    })
  }

  private startMultiplayer(mode: 'host' | 'join', joinCode?: string): void {
    const name = (this.root.querySelector('#kos-name') as HTMLInputElement).value.trim().slice(0, 24)
    this.settings.playerName = name || 'Player'
    this.persist()
    const status = this.root.querySelector('#kos-mp-status') as HTMLElement | null
    const codeInput = this.root.querySelector('#kos-mp-code') as HTMLInputElement | null
    const botInput = this.root.querySelector('#kos-mp-bot-count') as HTMLInputElement | null
    const roomCode = (joinCode || codeInput?.value || '').trim().toUpperCase()
    if (joinCode && codeInput) codeInput.value = roomCode
    const rawBots = Number(botInput?.value)
    const botCount = Number.isFinite(rawBots) ? Math.max(0, Math.min(10, Math.round(rawBots))) : 10
    if (mode === 'join' && roomCode.length < 4) {
      if (status) status.textContent = 'Enter the host room code first.'
      return
    }
    if (status) status.textContent = mode === 'host' ? 'Creating room…' : `Joining ${roomCode}…`
    this.stopMenuAudio()
    this.stopRoomWatch()
    this.callbacks.onPlayMultiplayer({
      mode,
      roomCode: mode === 'join' ? roomCode : undefined,
      playerName: this.settings.playerName,
      difficulty: this.selectedDifficulty,
      botCount,
    })
  }

  private startRoomWatch(): void {
    if (this.watchingRooms) return
    this.watchingRooms = true
    const empty = this.root.querySelector('#kos-mp-rooms-empty') as HTMLElement | null
    if (empty) empty.textContent = 'Looking for rooms…'
    roomDirectory.watch((rooms) => this.renderRoomList(rooms))
  }

  private stopRoomWatch(): void {
    if (!this.watchingRooms) return
    this.watchingRooms = false
    roomDirectory.unwatch()
  }

  private renderRoomList(rooms: PublicRoomInfo[]): void {
    const host = this.root.querySelector('#kos-mp-rooms') as HTMLElement | null
    const empty = this.root.querySelector('#kos-mp-rooms-empty') as HTMLElement | null
    if (!host) return
    host.querySelectorAll('[data-join-code]').forEach((el) => el.remove())
    const open = rooms.filter((r) => r.players < r.max)
    if (empty) {
      empty.style.display = open.length ? 'none' : 'block'
      empty.textContent = open.length ? '' : 'No open rooms — create one'
    }
    for (const room of open) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'kos-mp-room'
      btn.setAttribute('data-join-code', room.code)
      btn.innerHTML = `
        <span class="kos-mp-room-name">${this.escapeHtml(room.name)}</span>
        <span class="kos-mp-room-meta">${room.players}/${room.max}</span>
      `
      host.appendChild(btn)
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  public setMultiplayerStatus(text: string): void {
    const status = this.root.querySelector('#kos-mp-status') as HTMLElement | null
    if (status) status.textContent = text
  }

  private persist(): void {
    saveSettings(this.settings)
    this.callbacks.onSettingsChanged(this.settings)
  }

  private applyCrosshairToGame(): void {
    this.gameCrosshair?.setSettings(this.settings.crosshair)
  }

  private buildCrosshairControls(): void {
    const host = this.root.querySelector('#kos-xhair-controls')!
    const c = this.settings.crosshair
    const rows: Array<{ key: keyof CrosshairSettings; label: string; min: number; max: number; step: number }> = [
      { key: 'size', label: 'Size', min: 0, max: 10, step: 0.5 },
      { key: 'thickness', label: 'Thickness', min: 0.5, max: 6, step: 0.5 },
      { key: 'gap', label: 'Gap', min: -5, max: 10, step: 0.5 },
      { key: 'colorR', label: 'Red', min: 0, max: 255, step: 1 },
      { key: 'colorG', label: 'Green', min: 0, max: 255, step: 1 },
      { key: 'colorB', label: 'Blue', min: 0, max: 255, step: 1 },
      { key: 'alpha', label: 'Alpha', min: 0.2, max: 1, step: 0.05 },
      { key: 'outlineThickness', label: 'Outline', min: 0, max: 3, step: 1 },
      { key: 'dotSize', label: 'Dot Size', min: 0.5, max: 4, step: 0.5 },
    ]

    host.innerHTML = rows
      .map(
        (r) => `
      <label class="kos-slider">
        <span>${r.label}<em data-val="${r.key}">${c[r.key]}</em></span>
        <input type="range" data-xhair="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${c[r.key]}" />
      </label>`
      )
      .join('')

    host.innerHTML += `
      <label class="kos-check"><input type="checkbox" data-xhair-bool="outline" ${c.outline ? 'checked' : ''}/> Outline</label>
      <label class="kos-check"><input type="checkbox" data-xhair-bool="centerDot" ${c.centerDot ? 'checked' : ''}/> Center Dot</label>
      <label class="kos-check"><input type="checkbox" data-xhair-bool="tStyle" ${c.tStyle ? 'checked' : ''}/> T-Style</label>
    `

    host.querySelectorAll('input[data-xhair]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = (input as HTMLInputElement).getAttribute('data-xhair') as keyof CrosshairSettings
        const val = Number((input as HTMLInputElement).value)
        ;(this.settings.crosshair as any)[key] = val
        const em = host.querySelector(`[data-val="${key}"]`)
        if (em) em.textContent = String(val)
        this.crosshairPreview.setSettings(this.settings.crosshair)
        this.applyCrosshairToGame()
        this.persist()
      })
    })

    host.querySelectorAll('input[data-xhair-bool]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = (input as HTMLInputElement).getAttribute('data-xhair-bool') as keyof CrosshairSettings
        ;(this.settings.crosshair as any)[key] = (input as HTMLInputElement).checked
        this.crosshairPreview.setSettings(this.settings.crosshair)
        this.applyCrosshairToGame()
        this.persist()
      })
    })
  }

  private syncSensitivityControl(): void {
    const sensInput = this.root.querySelector('#kos-sensitivity') as HTMLInputElement | null
    const sensVal = this.root.querySelector('#kos-sens-val')
    if (!sensInput) return
    sensInput.value = String(this.settings.sensitivity)
    if (sensVal) sensVal.textContent = String(this.settings.sensitivity)
  }

  private renderResolutionGroups(): void {
    const host = this.root.querySelector('#kos-res-groups')
    if (!host) return
    const current = resolutionKey(this.settings.resolutionWidth, this.settings.resolutionHeight)
    const active = this.root.querySelector('#kos-res-active')
    if (active) {
      active.textContent = `Active: ${this.settings.resolutionWidth}×${this.settings.resolutionHeight} (stretched)`
    }
    const aspects: AspectGroup[] = ['4:3', '16:9', '16:10']
    host.innerHTML = aspects
      .map((aspect) => {
        const presets = RESOLUTION_PRESETS.filter((p) => p.aspect === aspect)
        const chips = presets
          .map((p) => {
            const key = resolutionKey(p.width, p.height)
            const on = key === current ? ' is-on' : ''
            const star = p.recommended ? ' <span class="kos-res-star" title="Recommended">★</span>' : ''
            return `<button type="button" class="kos-res${on}" data-res="${key}">${p.width}×${p.height}${star}</button>`
          })
          .join('')
        return `
          <div class="kos-res-group">
            <div class="kos-res-aspect">${aspect}</div>
            <div class="kos-res-grid">${chips}</div>
          </div>`
      })
      .join('')
    this.syncGraphicsControls()
  }

  private syncGraphicsControls(): void {
    const q = this.settings.graphicsQuality || 'high'
    this.root.querySelectorAll('[data-gfx]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-gfx') === q)
    })
  }

  private syncCrosshairControls(): void {
    const host = this.root.querySelector('#kos-xhair-controls')
    if (!host) return
    const c = this.settings.crosshair
    host.querySelectorAll('input[data-xhair]').forEach((el) => {
      const input = el as HTMLInputElement
      const key = input.getAttribute('data-xhair') as keyof CrosshairSettings
      input.value = String(c[key])
      const em = host.querySelector(`[data-val="${key}"]`)
      if (em) em.textContent = String(c[key])
    })
    host.querySelectorAll('input[data-xhair-bool]').forEach((el) => {
      const input = el as HTMLInputElement
      const key = input.getAttribute('data-xhair-bool') as keyof CrosshairSettings
      input.checked = !!(c as any)[key]
    })
  }

  private renderKeybindList(): void {
    const list = this.root.querySelector('#kos-bind-list')!
    list.innerHTML = REBINDABLE_ACTIONS.map(({ key, label }) => {
      const code = this.settings.keybinds[key] || DEFAULT_KEYBINDS[key]
      const listening = this.listeningKey === key
      return `
        <button type="button" class="kos-bind ${listening ? 'is-listening' : ''}" data-bind="${key}">
          <span>${label}</span>
          <kbd>${listening ? 'Press key…' : formatKeyLabel(code)}</kbd>
        </button>`
    }).join('')

    list.querySelectorAll('[data-bind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).getAttribute('data-bind') as Key
        this.beginListen(key)
      })
    })
  }

  private beginListen(action: Key): void {
    this.listeningKey = action
    this.renderKeybindList()

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        cleanup()
        this.listeningKey = null
        this.renderKeybindList()
        return
      }
      const code = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
      this.assignBind(action, code)
      cleanup()
    }
    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      this.assignBind(action, `mouse${e.button}`)
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
  }

  private assignBind(action: Key, code: string): void {
    for (const [k, v] of Object.entries(this.settings.keybinds)) {
      if (v === code && k !== action) {
        this.settings.keybinds[k as Key] = this.settings.keybinds[action] || DEFAULT_KEYBINDS[action]
      }
    }
    this.settings.keybinds[action] = code
    this.listeningKey = null
    this.renderKeybindList()
    this.persist()
    this.callbacks.onSettingsChanged(this.settings)
  }

  private syncMobileControlsPanel(): void {
    this.settings.mobile = normalizeMobileSettings(this.settings.mobile)
    const enabled = this.root.querySelector('#kos-mobile-enabled') as HTMLInputElement | null
    if (enabled) enabled.checked = this.settings.mobile.enabled
    const lookInput = this.root.querySelector('#kos-mobile-look') as HTMLInputElement | null
    const lookVal = this.root.querySelector('#kos-mobile-look-val')
    if (lookInput) {
      lookInput.value = String(this.settings.mobile.lookSensitivity)
      if (lookVal) lookVal.textContent = String(this.settings.mobile.lookSensitivity)
    }
    const deadInput = this.root.querySelector('#kos-mobile-dead') as HTMLInputElement | null
    const deadVal = this.root.querySelector('#kos-mobile-dead-val')
    if (deadInput) {
      deadInput.value = String(this.settings.mobile.joystickDeadzone)
      if (deadVal) deadVal.textContent = String(this.settings.mobile.joystickDeadzone)
    }
    this.syncMobileModeSegs()
    this.renderMobileList()
    this.syncSelectedMobileSlot()
  }

  private syncMobileModeSegs(): void {
    const m = this.settings.mobile
    this.root.querySelectorAll('[data-seg="crouchMode"] [data-hold]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-hold') === m.crouchMode)
    })
    this.root.querySelectorAll('[data-seg="leanMode"] [data-hold]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-hold') === m.leanMode)
    })
    this.root.querySelectorAll('[data-seg="perfProfile"] [data-perf]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-perf') === m.perfProfile)
    })
  }

  private renderMobileList(): void {
    const host = this.root.querySelector('#kos-mobile-list')
    if (!host) return
    host.innerHTML = MOBILE_CONTROL_META.map((m) => {
      const slot = this.settings.mobile.layout[m.id]
      const on = this.selectedMobileId === m.id ? ' is-on' : ''
      return `<button type="button" class="kos-mobile-item${on}" data-mobile-id="${m.id}">
        <span>${m.glyph} ${m.label}</span>
        <em>${slot.visible ? `${Math.round(slot.x)}%, ${Math.round(slot.y)}%` : 'Hidden'}</em>
      </button>`
    }).join('')
  }

  private syncSelectedMobileSlot(): void {
    const panel = this.root.querySelector('#kos-mobile-slot-panel') as HTMLElement | null
    const name = this.root.querySelector('#kos-mobile-slot-name')
    if (!panel) return
    panel.hidden = !this.editingMobileLayout
    const id = this.selectedMobileId || this.mobileControls?.getSelectedId()
    if (!id) {
      if (name) name.textContent = '—'
      return
    }
    this.selectedMobileId = id
    const meta = MOBILE_CONTROL_META.find((m) => m.id === id)
    const slot = this.settings.mobile.layout[id]
    if (name) name.textContent = meta?.label || id
    const sizeInput = this.root.querySelector('#kos-mobile-size') as HTMLInputElement | null
    const sizeVal = this.root.querySelector('#kos-mobile-size-val')
    if (sizeInput) {
      sizeInput.value = String(slot.size)
      if (sizeVal) sizeVal.textContent = String(slot.size)
    }
    const opacityInput = this.root.querySelector('#kos-mobile-opacity') as HTMLInputElement | null
    const opacityVal = this.root.querySelector('#kos-mobile-opacity-val')
    if (opacityInput) {
      opacityInput.value = String(slot.opacity)
      if (opacityVal) opacityVal.textContent = String(slot.opacity)
    }
    const visibleInput = this.root.querySelector('#kos-mobile-visible') as HTMLInputElement | null
    if (visibleInput) visibleInput.checked = slot.visible
    this.renderMobileList()
  }

  private startMobileLayoutEdit(): void {
    if (!this.mobileControls) return
    this.editingMobileLayout = true
    this.root.classList.add('is-layout-edit')
    const dock = this.root.querySelector('#kos-mobile-slot-panel') as HTMLElement | null
    if (dock) {
      dock.hidden = false
      if (!dock.style.left) dock.style.left = '12px'
      if (!dock.style.top) dock.style.top = '12px'
    }
    this.mobileControls.applySettings(this.settings.mobile)
    this.mobileControls.setEditMode(true, (layout) => {
      this.settings.mobile.layout = layout
      this.selectedMobileId = this.mobileControls?.getSelectedId() || this.selectedMobileId
      this.syncSelectedMobileSlot()
      this.persist()
    })
    this.selectedMobileId = this.selectedMobileId || 'fire'
    this.mobileControls.selectControl(this.selectedMobileId)
    this.syncSelectedMobileSlot()
  }

  private stopMobileLayoutEdit(): void {
    if (!this.editingMobileLayout) return
    this.editingMobileLayout = false
    this.root.classList.remove('is-layout-edit')
    this.mobileControls?.setEditMode(false)
    const panel = this.root.querySelector('#kos-mobile-slot-panel') as HTMLElement | null
    if (panel) panel.hidden = true
    this.persist()
  }

  private bindDockDrag(): void {
    const dock = this.root.querySelector('#kos-mobile-slot-panel') as HTMLElement | null
    if (!dock) return
    const onDown = (e: PointerEvent) => {
      const grip = (e.target as HTMLElement).closest('[data-dock-drag]')
      if (!grip || !this.editingMobileLayout) return
      e.preventDefault()
      e.stopPropagation()
      const rect = dock.getBoundingClientRect()
      this.dockDrag = {
        pointerId: e.pointerId,
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        x: rect.left,
        y: rect.top,
      }
      dock.setPointerCapture?.(e.pointerId)
      dock.classList.add('is-dragging')
    }
    const onMove = (e: PointerEvent) => {
      if (!this.dockDrag || this.dockDrag.pointerId !== e.pointerId) return
      e.preventDefault()
      const w = dock.offsetWidth
      const h = dock.offsetHeight
      const safeL = Math.max(4, this.readSafeInset('left'))
      const safeR = Math.max(4, this.readSafeInset('right'))
      const safeT = Math.max(4, this.readSafeInset('top'))
      const safeB = Math.max(4, this.readSafeInset('bottom'))
      const x = Math.max(
        safeL,
        Math.min(window.innerWidth - w - safeR, e.clientX - this.dockDrag.ox)
      )
      const y = Math.max(
        safeT,
        Math.min(window.innerHeight - h - safeB, e.clientY - this.dockDrag.oy)
      )
      dock.style.left = `${x}px`
      dock.style.top = `${y}px`
      dock.style.right = 'auto'
      dock.style.bottom = 'auto'
    }
    const onUp = (e: PointerEvent) => {
      if (!this.dockDrag || this.dockDrag.pointerId !== e.pointerId) return
      this.dockDrag = null
      dock.classList.remove('is-dragging')
    }
    dock.addEventListener('pointerdown', onDown)
    dock.addEventListener('pointermove', onMove)
    dock.addEventListener('pointerup', onUp)
    dock.addEventListener('pointercancel', onUp)
  }

  private ensureStyles(): void {
    document.getElementById('kos-menu-styles')?.remove()
    const style = document.createElement('style')
    style.id = 'kos-menu-styles'
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');

      #kos-menu {
        --kos-blue: #1a5fff;
        --kos-blue-deep: #0a45d6;
        --kos-blue-soft: #eaf1ff;
        --kos-gold: #c9a227;
        --kos-gold-bright: #e0b93a;
        --kos-gold-soft: #fff8e6;
        --kos-ink: #0a1220;
        --kos-muted: #5a6a80;
        --kos-line: rgba(10, 30, 80, 0.10);
        --kos-white: #ffffff;
        --kos-bg: #f5f7fb;
        --kos-ease: cubic-bezier(0.16, 1, 0.3, 1);

        position: fixed; inset: 0; z-index: 40;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        color: var(--kos-ink);
        display: block;
        transition: opacity 320ms var(--kos-ease), visibility 320ms var(--kos-ease);
        -webkit-font-smoothing: antialiased;
      }
      #kos-menu.is-hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        display: none !important;
      }
      #kos-menu *, #kos-menu *::before, #kos-menu *::after { box-sizing: border-box; }

      .kos-bg {
        position: absolute; inset: 0;
        background: var(--kos-bg);
        overflow: hidden;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .kos-bg-art {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        object-position: center right;
        display: block;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        -webkit-touch-callout: none;
        transform: scale(1.02);
        filter: blur(0);
        transition: filter 320ms var(--kos-ease), transform 320ms var(--kos-ease);
      }
      #kos-menu.is-bg-blur .kos-bg-art {
        filter: blur(14px);
        transform: scale(1.08);
      }
      #kos-menu.is-bg-blur .kos-bg-veil {
        background:
          linear-gradient(90deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.35) 100%),
          linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 30%, transparent 70%, rgba(245,247,251,0.45) 100%);
      }
      .kos-bg-veil {
        position: absolute; inset: 0;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.28) 42%, transparent 68%),
          linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 28%, transparent 72%, rgba(245,247,251,0.35) 100%);
      }
      .kos-bg-vignette {
        position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(ellipse 90% 80% at 55% 45%, transparent 45%, rgba(10, 30, 80, 0.06) 100%);
      }

      .kos-screen {
        position: absolute; inset: 0; z-index: 1;
        display: none;
        animation: kos-fade-in 400ms var(--kos-ease) both;
      }
      .kos-screen.is-active { display: flex; }
      @keyframes kos-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .kos-load {
        margin: auto;
        display: flex; flex-direction: column; align-items: center;
        padding: 24px;
      }
      .kos-logo-load {
        width: min(340px, 72vw);
        height: auto;
        display: block;
        filter: drop-shadow(0 16px 40px rgba(26, 95, 255, 0.18));
        animation: kos-logo-in 0.8s var(--kos-ease) both;
      }
      .kos-load-wrap { width: min(280px, 70vw); margin-top: 28px; text-align: center; }
      .kos-load-track {
        height: 4px;
        background: rgba(26, 95, 255, 0.10);
        overflow: hidden;
      }
      .kos-load-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, var(--kos-blue), var(--kos-gold-bright));
        transition: width 240ms var(--kos-ease);
      }
      .kos-load-label {
        margin: 14px 0 0; font-size: 11px; font-weight: 700;
        letter-spacing: 0.22em; text-transform: uppercase; color: var(--kos-muted);
      }
      .kos-load-error { color: #dc2626; font-size: 13px; font-weight: 600; margin-top: 10px; }

      .kos-shell-main {
        width: 100%; height: 100%;
        display: grid;
        grid-template-columns: minmax(280px, 420px) 1fr;
        grid-template-rows: 1fr auto;
        grid-template-areas:
          "hero hero"
          "rail .";
        padding: clamp(28px, 5vh, 56px) clamp(28px, 5vw, 72px) clamp(32px, 6vh, 64px);
        align-content: end;
      }
      .kos-hero {
        grid-area: hero;
        display: flex; align-items: flex-end;
        padding-bottom: clamp(12px, 2vh, 28px);
        animation: kos-slide-up 560ms var(--kos-ease) both;
      }
      .kos-logo-hero {
        width: min(420px, 48vw, 55vh);
        height: auto;
        display: block;
        object-fit: contain;
        filter: drop-shadow(0 20px 48px rgba(26, 95, 255, 0.16));
        pointer-events: none;
        user-select: none;
      }
      .kos-menu-rail {
        grid-area: rail;
        display: flex; flex-direction: column;
        gap: 20px;
        width: 100%;
        max-width: 380px;
        animation: kos-slide-up 560ms var(--kos-ease) 80ms both;
      }

      @keyframes kos-logo-in {
        from { opacity: 0; transform: scale(0.94) translateY(16px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes kos-slide-up {
        from { opacity: 0; transform: translateY(28px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .kos-shell-sub {
        width: min(440px, 92vw);
        max-height: min(92vh, 880px);
        margin: auto;
        padding: clamp(24px, 4vh, 40px) clamp(22px, 4vw, 36px);
        overflow-y: auto;
        display: flex; flex-direction: column; align-items: stretch;
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(20px) saturate(1.2);
        -webkit-backdrop-filter: blur(20px) saturate(1.2);
        border: 1px solid rgba(255, 255, 255, 0.9);
        border-left: 3px solid var(--kos-blue);
        box-shadow: 0 24px 64px rgba(10, 30, 80, 0.10);
        scrollbar-width: thin;
        scrollbar-color: rgba(26, 95, 255, 0.25) transparent;
        animation: kos-slide-up 420ms var(--kos-ease) both;
      }
      .kos-shell-settings { width: min(640px, 94vw); }
      .kos-sub-brand { margin-bottom: 4px; }
      .kos-logo-sm {
        width: min(120px, 32vw);
        height: auto;
        display: block;
        filter: drop-shadow(0 8px 20px rgba(26, 95, 255, 0.12));
      }

      .kos-heading {
        margin: 8px 0 6px;
        font-size: clamp(26px, 4vw, 34px);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1.1;
        color: var(--kos-ink);
      }
      .kos-hint {
        margin: 0 0 22px;
        font-size: 14px; font-weight: 500;
        color: var(--kos-muted); line-height: 1.5;
      }
      .kos-hint.tight {
        margin: 10px 0 0; text-align: center;
        font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;
        color: var(--kos-muted);
      }
      .kos-xhair-preview-wrap .kos-hint.tight {
        color: rgba(226, 232, 240, 0.55);
      }
      .kos-hint.tight-left { margin: -8px 0 18px; font-size: 12.5px; }
      .kos-mp-or {
        margin: 14px 0 10px;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-section-label {
        margin: 4px 0 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-mp-rooms {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        max-height: min(42vh, 280px);
        overflow-y: auto;
        margin: 0 0 18px;
        padding-right: 2px;
      }
      .kos-mp-rooms-empty {
        padding: 14px 4px;
        font-size: 13px;
        font-weight: 600;
        color: var(--kos-muted);
        text-align: center;
      }
      .kos-mp-room {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border: 1px solid var(--kos-line);
        border-left: 3px solid var(--kos-blue);
        background: rgba(255, 255, 255, 0.88);
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 15px;
        font-weight: 700;
        text-align: left;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
      }
      .kos-mp-room:hover,
      .kos-mp-room:focus-visible {
        background: var(--kos-blue-soft);
        border-color: rgba(26, 95, 255, 0.28);
        outline: none;
        transform: translateX(2px);
      }
      .kos-mp-room-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .kos-mp-room-meta {
        flex-shrink: 0;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: var(--kos-blue-deep);
        font-variant-numeric: tabular-nums;
      }

      .kos-field {
        display: flex; flex-direction: column; gap: 8px; width: 100%;
      }
      .kos-field span {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--kos-muted);
      }
      .kos-field input {
        background: rgba(255, 255, 255, 0.85);
        border: none;
        border-bottom: 2px solid var(--kos-line);
        border-radius: 0;
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 16px; font-weight: 600;
        padding: 12px 2px 11px;
        outline: none;
        transition: border-color 180ms ease, background 180ms ease;
      }
      .kos-field input::placeholder { color: #94a3b8; font-weight: 500; }
      .kos-field input:hover { border-bottom-color: rgba(26, 95, 255, 0.35); }
      .kos-field input:focus {
        border-bottom-color: var(--kos-blue);
        background: rgba(255, 255, 255, 0.95);
      }
      .kos-field-inline {
        flex-direction: row; align-items: center; justify-content: space-between;
        margin-bottom: 8px;
      }
      .kos-field-inline input[type=number] {
        max-width: 96px; text-align: center;
        font-size: 18px; font-weight: 800;
        font-variant-numeric: tabular-nums;
        border: 2px solid var(--kos-line);
        border-radius: 0;
        padding: 10px 8px;
        background: #fff;
        appearance: textfield;
        -moz-appearance: textfield;
      }
      .kos-field-inline input[type=number]::-webkit-inner-spin-button,
      .kos-field-inline input[type=number]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .kos-field-inline input[type=number]:focus {
        border-color: var(--kos-blue);
      }

      .kos-nav {
        display: flex; flex-direction: column; gap: 6px; width: 100%;
      }
      .kos-btn {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 17px; font-weight: 700;
        letter-spacing: -0.01em;
        padding: 16px 18px;
        cursor: pointer;
        text-align: left;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px;
        min-height: 56px;
        position: relative;
        clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms var(--kos-ease),
          box-shadow 200ms var(--kos-ease);
      }
      .kos-btn-label { position: relative; z-index: 1; }
      .kos-btn::before {
        content: "";
        position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        background: transparent;
        transition: background 160ms ease, box-shadow 160ms ease;
      }
      .kos-btn:hover:not(:disabled) {
        background: rgba(26, 95, 255, 0.06);
        color: var(--kos-blue-deep);
        transform: translateX(4px);
      }
      .kos-btn:hover:not(:disabled)::before {
        background: var(--kos-blue);
        box-shadow: 0 0 12px rgba(26, 95, 255, 0.4);
      }
      .kos-btn:active:not(:disabled) { transform: translateX(2px) scale(0.99); }
      .kos-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .kos-btn:focus-visible,
      .kos-chip:focus-visible,
      .kos-tab:focus-visible,
      .kos-back:focus-visible,
      .kos-bind:focus-visible,
      .kos-res:focus-visible,
      .kos-seg button:focus-visible {
        outline: 2px solid var(--kos-gold);
        outline-offset: 2px;
      }

      .kos-btn-primary {
        background: linear-gradient(90deg, var(--kos-blue-deep) 0%, var(--kos-blue) 100%);
        color: #fff;
        font-size: 18px; font-weight: 800;
        letter-spacing: 0.04em; text-transform: uppercase;
        box-shadow: 0 8px 28px rgba(26, 95, 255, 0.32);
        clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
      }
      .kos-btn-primary::before { background: var(--kos-gold-bright); width: 4px; }
      .kos-btn-primary:hover:not(:disabled) {
        background: linear-gradient(90deg, #0d52e8 0%, #2b6fff 100%);
        color: #fff;
        transform: translateX(4px);
        box-shadow: 0 12px 36px rgba(26, 95, 255, 0.42), 0 0 0 1px rgba(26, 95, 255, 0.2);
      }
      .kos-btn-primary:hover:not(:disabled)::before {
        background: var(--kos-gold-bright);
        box-shadow: 0 0 14px rgba(224, 185, 58, 0.6);
      }

      .kos-btn-ghost-line {
        background: transparent;
        border-bottom: 1px solid var(--kos-line);
        clip-path: none;
        font-size: 15px; font-weight: 650;
        min-height: 50px;
        padding: 14px 8px 14px 18px;
      }
      .kos-btn-ghost-line:hover:not(:disabled) {
        background: rgba(26, 95, 255, 0.04);
        border-bottom-color: rgba(26, 95, 255, 0.2);
      }

      .kos-btn-ghost {
        margin-top: 16px; justify-content: center;
        font-size: 13px; font-weight: 650;
        min-height: 44px; padding: 12px 16px;
        background: var(--kos-blue-soft);
        color: var(--kos-blue-deep);
        clip-path: none;
        letter-spacing: 0;
        text-transform: none;
      }
      .kos-btn-ghost:hover:not(:disabled) {
        background: #d8e6ff;
        transform: translateY(-1px);
        color: var(--kos-blue-deep);
      }
      .kos-btn-ghost::before { display: none; }

      .kos-soon {
        font-size: 9px; font-weight: 800;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: var(--kos-gold);
        background: var(--kos-gold-soft);
        border: 1px solid rgba(201, 162, 39, 0.35);
        padding: 4px 9px;
        flex-shrink: 0;
      }

      .kos-back {
        align-self: flex-start;
        background: none; border: none;
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 650;
        cursor: pointer;
        margin-bottom: 12px; padding: 6px 0;
        transition: color 140ms ease, transform 140ms ease;
      }
      .kos-back:hover { color: var(--kos-blue); transform: translateX(-3px); }

      .kos-section-label {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: var(--kos-muted); margin: 4px 0 10px;
      }
      .kos-chip-row {
        display: flex; gap: 8px; width: 100%; margin-bottom: 20px;
      }
      .kos-chip {
        flex: 1; appearance: none; cursor: pointer;
        background: #fff;
        border: 1.5px solid var(--kos-line);
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 700;
        padding: 13px 6px;
        clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
        transition: all 160ms var(--kos-ease);
      }
      .kos-chip:hover {
        border-color: rgba(26, 95, 255, 0.35);
        color: var(--kos-blue-deep);
      }
      .kos-chip.is-on {
        background: var(--kos-blue);
        border-color: transparent;
        color: #fff;
        box-shadow: 0 8px 20px rgba(26, 95, 255, 0.28);
      }
      .kos-start {
        width: 100%; margin-top: 8px; justify-content: center;
        font-size: 15px; letter-spacing: 0.08em;
      }

      #kos-menu.is-layout-edit {
        z-index: 80;
        pointer-events: none;
        background: transparent;
      }
      #kos-menu.is-layout-edit .kos-bg,
      #kos-menu.is-layout-edit .kos-screen { opacity: 0; visibility: hidden; pointer-events: none; }
      #kos-menu.is-layout-edit .kos-mobile-dock {
        display: flex !important;
        pointer-events: auto;
      }
      #kos-menu.is-desktop [data-mobile-only] { display: none !important; }
      #kos-menu.is-mobile-ui [data-desktop-only] { display: none !important; }

      .kos-res, .kos-chip, .kos-seg button, .kos-bind, .kos-mobile-item {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .kos-mset {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }
      .kos-mset-card {
        background: #fff;
        border: 1px solid var(--kos-line);
        border-radius: 14px;
        padding: 14px 14px 12px;
        box-shadow: 0 8px 18px rgba(10, 30, 80, 0.04);
      }
      .kos-mset-head {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 10px;
      }
      .kos-mset-head strong {
        font-size: 14px;
        font-weight: 750;
        color: var(--kos-ink);
      }
      .kos-mset-head em {
        font-style: normal;
        font-size: 12px;
        color: var(--kos-muted);
      }
      .kos-seg {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 6px;
        padding: 4px;
        border-radius: 12px;
        background: var(--kos-blue-soft);
      }
      .kos-seg button {
        appearance: none;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--kos-muted);
        font: inherit;
        font-size: 12px;
        font-weight: 750;
        padding: 10px 8px;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
      }
      .kos-seg button.is-on {
        background: #fff;
        color: var(--kos-blue-deep);
        box-shadow: 0 4px 12px rgba(26, 95, 255, 0.16);
      }

      .kos-mobile-editor-actions {
        display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px;
      }
      .kos-mobile-editor-actions .kos-btn { flex: 1; min-width: 120px; justify-content: center; margin-top: 0; }
      .kos-mobile-dock {
        display: none;
        position: fixed;
        left: 12px;
        top: max(12px, env(safe-area-inset-top));
        z-index: 95;
        width: min(200px, 58vw);
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px 10px;
        border-radius: 14px;
        background: rgba(10, 16, 28, 0.88);
        border: 1px solid rgba(255,255,255,0.14);
        box-shadow: 0 12px 28px rgba(0,0,0,0.4);
        color: #fff;
        backdrop-filter: blur(10px);
        touch-action: none;
      }
      .kos-mobile-dock.is-dragging { opacity: 0.92; }
      .kos-mobile-dock-grip {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 4px 0 2px;
        cursor: grab;
        color: rgba(255,255,255,0.55);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
      }
      .kos-mobile-dock-grip em { font-style: normal; }
      .kos-mobile-dock-bars {
        width: 28px; height: 3px; border-radius: 99px;
        background: rgba(255,255,255,0.35);
        box-shadow: 0 5px 0 rgba(255,255,255,0.35);
      }
      .kos-mobile-dock-top {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .kos-mobile-dock-top strong {
        font-size: 12px; font-weight: 700;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .kos-mobile-done {
        appearance: none; border: 0; border-radius: 999px;
        background: #1a5fff; color: #fff;
        font: inherit; font-size: 13px; font-weight: 800;
        padding: 10px 16px; cursor: pointer;
        flex-shrink: 0;
        min-height: 44px;
      }
      .kos-mobile-dock-slider {
        margin: 0;
        color: rgba(255,255,255,0.9);
      }
      .kos-mobile-dock-slider span {
        display: flex; justify-content: space-between;
        font-size: 11px; margin-bottom: 2px;
      }
      .kos-mobile-dock-slider input[type="range"] {
        width: 100%;
        height: 28px;
      }
      .kos-mobile-dock-check {
        color: rgba(255,255,255,0.9);
        font-size: 11px;
        gap: 6px;
      }
      .kos-mobile-list {
        display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto;
      }
      .kos-mobile-item {
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
        width: 100%; appearance: none; cursor: pointer;
        background: #fff; border: 1px solid var(--kos-line);
        border-radius: 10px; padding: 10px 12px;
        font: inherit; color: var(--kos-ink); text-align: left;
      }
      .kos-mobile-item em { color: var(--kos-muted); font-style: normal; font-size: 12px; }
      .kos-mobile-item.is-on {
        border-color: rgba(26,95,255,0.45);
        background: #eef4ff;
        color: var(--kos-blue-deep);
      }
      .kos-mobile-editor-actions {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 0 4px;
        background: linear-gradient(180deg, rgba(255,255,255,0), #fff 28%);
      }

      .kos-tabs {
        display: flex; gap: 0; width: 100%; margin: 10px 0 20px;
        border-bottom: 2px solid var(--kos-line);
        flex-wrap: wrap;
      }
      .kos-tab {
        flex: 1; appearance: none; border: none; cursor: pointer;
        background: transparent;
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 13px; font-weight: 700;
        padding: 12px 8px 14px;
        position: relative;
        transition: color 160ms ease;
      }
      .kos-tab:hover { color: var(--kos-blue-deep); }
      .kos-tab.is-on { color: var(--kos-blue-deep); }
      .kos-tab.is-on::after {
        content: "";
        position: absolute; left: 0; right: 0; bottom: -2px;
        height: 2px;
        background: linear-gradient(90deg, var(--kos-blue), var(--kos-gold));
      }
      .kos-tab-panel { display: none; width: 100%; animation: kos-fade-in 280ms ease both; }
      .kos-tab-panel.is-on { display: block; }

      .kos-res-groups {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .kos-res-aspect {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--kos-blue-deep);
        margin-bottom: 8px;
      }
      .kos-res-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .kos-res {
        appearance: none;
        border: 1.5px solid var(--kos-line);
        background: #fff;
        color: var(--kos-muted);
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 10px 12px;
        cursor: pointer;
        clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
        transition: all 160ms var(--kos-ease);
      }
      .kos-res:hover {
        border-color: rgba(26, 95, 255, 0.35);
        color: var(--kos-blue-deep);
      }
      .kos-res.is-on {
        background: var(--kos-blue);
        border-color: transparent;
        color: #fff;
        box-shadow: 0 8px 20px rgba(26, 95, 255, 0.28);
      }
      .kos-res-star {
        color: #c9a227;
        margin-left: 2px;
      }

      .kos-xhair-preview-wrap {
        display: flex; flex-direction: column; align-items: center;
        background: radial-gradient(circle at center, #2a3544 0%, #0f172a 75%);
        padding: 18px 12px 12px;
        border: 1px solid rgba(10, 30, 80, 0.12);
        margin-bottom: 14px;
      }
      .kos-xhair-controls {
        max-height: min(42vh, 320px); overflow-y: auto; padding-right: 4px;
        display: flex; flex-direction: column; gap: 4px;
        scrollbar-width: thin;
      }
      .kos-slider {
        display: flex; flex-direction: column; gap: 2px;
        font-size: 12px; color: var(--kos-muted); font-weight: 650;
        padding: 4px 0;
      }
      .kos-slider span { display: flex; justify-content: space-between; }
      .kos-slider em {
        font-style: normal; color: var(--kos-blue-deep);
        font-variant-numeric: tabular-nums; font-weight: 800;
      }
      .kos-slider input[type=range] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 28px;
        margin: 0;
        background: transparent;
        cursor: pointer;
      }
      .kos-slider input[type=range]::-webkit-slider-runnable-track {
        height: 4px;
        background: var(--kos-line);
        border: none;
      }
      .kos-slider input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        margin-top: -5px;
        background: var(--kos-blue);
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(201, 162, 39, 0.55), 0 2px 8px rgba(26, 95, 255, 0.35);
        clip-path: polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%);
      }
      .kos-slider input[type=range]:active::-webkit-slider-thumb {
        box-shadow: 0 0 0 2px var(--kos-gold), 0 2px 10px rgba(26, 95, 255, 0.45);
      }
      .kos-slider input[type=range]::-moz-range-track {
        height: 4px;
        background: var(--kos-line);
        border: none;
      }
      .kos-slider input[type=range]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: var(--kos-blue);
        border: 2px solid #fff;
        border-radius: 0;
        box-shadow: 0 0 0 1px rgba(201, 162, 39, 0.55);
      }
      .kos-sens-slider { margin-bottom: 10px; }

      .kos-check {
        display: flex; align-items: center; gap: 10px;
        font-size: 13px; font-weight: 650; color: var(--kos-ink); cursor: pointer;
        padding: 6px 0;
      }
      .kos-check input { accent-color: var(--kos-blue); width: 15px; height: 15px; cursor: pointer; }

      .kos-match-opt {
        align-items: flex-start;
        width: 100%;
        margin: 4px 0 18px;
        padding: 14px 14px 14px 16px;
        background: linear-gradient(135deg, #fff 0%, var(--kos-gold-soft) 100%);
        border: 1px solid rgba(201, 162, 39, 0.28);
        border-left: 3px solid var(--kos-gold);
        gap: 12px;
        transition: box-shadow 180ms ease, transform 160ms ease;
      }
      .kos-match-opt:hover {
        box-shadow: 0 10px 24px rgba(201, 162, 39, 0.12);
        transform: translateY(-1px);
      }
      .kos-match-opt input {
        margin-top: 2px; accent-color: var(--kos-gold);
        width: 16px; height: 16px; flex-shrink: 0;
      }
      .kos-match-opt span { display: flex; flex-direction: column; gap: 3px; }
      .kos-match-opt strong { font-size: 14px; font-weight: 700; color: var(--kos-ink); }
      .kos-match-opt em { font-style: normal; font-size: 12px; font-weight: 500; color: var(--kos-muted); line-height: 1.35; }

      .kos-bind-list {
        display: flex; flex-direction: column; gap: 6px;
        max-height: 360px; overflow-y: auto; width: 100%;
        scrollbar-width: thin;
      }
      .kos-bind {
        display: flex; justify-content: space-between; align-items: center;
        width: 100%; appearance: none; cursor: pointer;
        background: #fff;
        border: 1px solid var(--kos-line);
        border-left: 3px solid transparent;
        color: var(--kos-ink);
        font-family: inherit;
        font-size: 13px; font-weight: 650;
        padding: 12px 12px;
        text-align: left;
        transition: all 150ms ease;
      }
      .kos-bind:hover {
        border-left-color: var(--kos-blue);
        box-shadow: 0 6px 16px rgba(26, 95, 255, 0.08);
        transform: translateX(2px);
      }
      .kos-bind.is-listening {
        border-color: rgba(201, 162, 39, 0.4);
        border-left-color: var(--kos-gold);
        background: var(--kos-gold-soft);
      }
      .kos-bind kbd {
        font-family: inherit; font-size: 11px; font-weight: 800;
        letter-spacing: 0.06em; min-width: 68px; text-align: center;
        padding: 5px 9px;
        background: var(--kos-blue-soft);
        color: var(--kos-blue-deep);
        border: 1px solid rgba(26, 95, 255, 0.14);
      }
      .kos-bind.is-listening kbd {
        background: #fff; color: var(--kos-gold);
        border-color: rgba(201, 162, 39, 0.35);
      }

      #game-crosshair {
        position: fixed !important;
        left: 50% !important;
        top: 50% !important;
        right: auto !important;
        bottom: auto !important;
        inset: auto !important;
        width: 48px !important;
        height: 48px !important;
        max-width: 48px !important;
        max-height: 48px !important;
        transform: translate(-50%, -50%);
        z-index: 10000;
        pointer-events: none;
        background: transparent !important;
        opacity: 0;
        visibility: hidden;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }
      #game-crosshair.is-on { opacity: 1; visibility: visible; display: block; }
      #game-crosshair.is-awp-hidden { opacity: 0 !important; visibility: hidden !important; display: none !important; }

      @media (max-width: 900px) {
        .kos-shell-main {
          grid-template-columns: 1fr;
          grid-template-areas: "hero" "rail";
          align-content: center;
          justify-items: start;
          padding: 32px 28px 40px;
        }
        .kos-logo-hero { width: min(300px, 70vw); }
        .kos-menu-rail { max-width: 360px; }
      }
      @media (max-width: 520px) {
        .kos-shell-main { padding: 24px 20px 32px; }
        .kos-logo-hero { width: min(240px, 78vw); }
        .kos-menu-rail { max-width: 100%; }
        .kos-btn { font-size: 15px; min-height: 50px; padding: 14px 14px; }
        .kos-btn-primary { font-size: 15px; }
        .kos-shell-sub { padding: 20px 16px 24px; width: min(440px, 94vw); }
        .kos-heading { font-size: 24px; }
      }
      @media (min-width: 1400px) {
        .kos-shell-main {
          grid-template-columns: minmax(340px, 460px) 1fr;
          padding: 64px 96px 72px;
        }
        .kos-logo-hero { width: min(480px, 36vw); }
        .kos-menu-rail { max-width: 400px; }
      }

      /* Mobile: always keep menu buttons reachable (esp. iPhone landscape) */
      #kos-menu.is-mobile-ui .kos-screen.is-active {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      #kos-menu.is-mobile-ui .kos-shell-main {
        min-height: 100%;
        min-height: 100dvh;
        box-sizing: border-box;
        align-content: start;
        overflow: visible;
        padding:
          max(16px, env(safe-area-inset-top))
          max(18px, env(safe-area-inset-right))
          max(18px, env(safe-area-inset-bottom))
          max(18px, env(safe-area-inset-left));
      }
      #kos-menu.is-mobile-ui .kos-logo-hero {
        width: min(220px, 56vw, 36vh);
      }
      #kos-menu.is-mobile-ui .kos-menu-rail {
        max-width: min(420px, 100%);
        gap: 12px;
      }
      #kos-menu.is-mobile-ui .kos-nav { gap: 4px; }
      #kos-menu.is-mobile-ui .kos-btn {
        min-height: 46px;
        padding: 12px 14px;
        font-size: 15px;
      }
      #kos-menu.is-mobile-ui .kos-btn-primary { font-size: 15px; }
      #kos-menu.is-mobile-ui .kos-field { gap: 6px; }
      #kos-menu.is-mobile-ui .kos-field input {
        padding: 10px 2px 9px;
        font-size: 15px;
      }
      #kos-menu.is-mobile-ui .kos-shell-sub,
      #kos-menu.is-mobile-ui .kos-shell-settings {
        width: min(520px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));
        max-height: calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
        margin:
          max(8px, env(safe-area-inset-top))
          max(12px, env(safe-area-inset-right))
          max(8px, env(safe-area-inset-bottom))
          max(12px, env(safe-area-inset-left));
      }

      /* Wide / short phones (iPhone 11 landscape): logo beside buttons */
      @media (orientation: landscape) and (max-height: 520px) {
        #kos-menu.is-mobile-ui .kos-shell-main {
          grid-template-columns: minmax(120px, 30vw) minmax(240px, 1fr);
          grid-template-areas: "hero rail";
          align-items: center;
          align-content: center;
          justify-items: stretch;
          gap: 8px 20px;
          padding:
            max(10px, env(safe-area-inset-top))
            max(16px, env(safe-area-inset-right))
            max(10px, env(safe-area-inset-bottom))
            max(16px, env(safe-area-inset-left));
        }
        #kos-menu.is-mobile-ui .kos-hero {
          align-items: center;
          justify-content: center;
          padding-bottom: 0;
        }
        #kos-menu.is-mobile-ui .kos-logo-hero {
          width: min(180px, 28vw, 72vh);
        }
        #kos-menu.is-mobile-ui .kos-menu-rail {
          max-width: 460px;
          gap: 8px;
        }
        #kos-menu.is-mobile-ui .kos-btn {
          min-height: 42px;
          padding: 9px 12px;
          font-size: 14px;
        }
        #kos-menu.is-mobile-ui .kos-btn-primary { font-size: 14px; }
        #kos-menu.is-mobile-ui .kos-field span {
          font-size: 9px;
        }
        #kos-menu.is-mobile-ui .kos-field input {
          padding: 7px 2px 6px;
          font-size: 14px;
        }
        #kos-menu.is-mobile-ui .kos-shell-sub,
        #kos-menu.is-mobile-ui .kos-shell-settings {
          max-height: calc(100dvh - 12px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          padding: 14px 16px 16px;
        }
        #kos-menu.is-mobile-ui .kos-logo-sm { width: min(72px, 18vw); }
        #kos-menu.is-mobile-ui .kos-heading { font-size: 20px; margin: 4px 0; }
        #kos-menu.is-mobile-ui .kos-hint { margin-bottom: 10px; font-size: 12px; }
        #kos-menu.is-mobile-ui .kos-chip { padding: 9px 6px; font-size: 12px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .kos-screen, .kos-logo-load, .kos-hero, .kos-menu-rail, .kos-shell-sub, .kos-tab-panel {
          animation: none !important;
        }
      }
    `
    document.head.appendChild(style)
  }
}
