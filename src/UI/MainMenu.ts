import type { BotDifficulty } from '../Core/TrainingBot'
import { DEFAULT_MAP_ID, getMapDefinition, mapSupportsTeams, type MapId } from '../Core/MapCatalog'
import {
  clampTeamSize,
  DEFAULT_TEAM_SIZE,
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
  TEAM_LABEL,
  type Team,
} from '../Core/Teams'
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
import type { MobileHoldMode, MobilePerfProfile, MobileRes43, MobileResMode } from './SettingsStore'
import { roomDirectory, type PublicRoomInfo } from '../Net/RoomDirectory'
import {
  CareerStats,
  DEFAULT_MATCH_LENGTH,
  MATCH_LENGTHS,
  formatPlaytime,
  ratio,
  type MatchLength,
  type TeamMode,
} from '../Core/MatchStats'
import { MAIN_MENU_HTML } from './MainMenuHtml'
import { MAIN_MENU_CSS } from './MainMenuStyles'

export type BotMatchConfig = {
  difficulty: BotDifficulty
  botCount: number
  playerName: string
  /** Instantly refill mag to full after each bot kill */
  refillAmmoOnKill: boolean
  /** Selected arena */
  mapId: MapId
  /** Score/time target that ends the match */
  matchLength: MatchLength
  /** T vs CT deathmatch instead of free-for-all (Dust II only) */
  teamPlay?: boolean
  /** Side you play on when teamPlay is set */
  playerTeam?: Team
  /** Players per side, 5–10 */
  teamSize?: number
}

type MenuCallbacks = {
  onPlayBots: (config: BotMatchConfig) => void
  onPlayMultiplayer: (config: {
    mode: 'host' | 'join'
    roomCode?: string
    playerName: string
    difficulty: BotDifficulty
    botCount: number
    matchLength: MatchLength
    teamMode: TeamMode
    mapId: MapId
    teamPlay: boolean
    playerTeam: Team
    teamSize: number
  }) => void
  onSettingsChanged: (settings: PlayerSettings) => void
  /** Warm the selected map GLB in the background while browsing bots/MP. */
  onMapSelected?: (mapId: MapId) => void
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
  private selectedMatchLength: MatchLength = DEFAULT_MATCH_LENGTH
  private selectedTeamMode: TeamMode = 'coop'
  private teamPlay = false
  private selectedTeam: Team = 'CT'
  private selectedTeamSize = DEFAULT_TEAM_SIZE
  private mpTeamPlay = false
  private mpTeam: Team = 'CT'
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
    const body = this.root.querySelector('.kos-panel-body') as HTMLElement | null
    if (body) body.scrollTop = 0
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
    const clamped = Math.max(0, Math.min(100, pct))
    const bar = this.root.querySelector('.kos-load-fill') as HTMLElement | null
    const text = this.root.querySelector('.kos-load-label') as HTMLElement | null
    const pctEl = this.root.querySelector('#kos-load-pct') as HTMLElement | null
    if (bar) bar.style.width = `${clamped}%`
    if (text) text.textContent = label
    if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`
  }

  /** Full-screen loading overlay used at boot and again when a match map loads. */
  public showMatchLoading(label: string, pct = 12): void {
    this.root.classList.remove('is-hidden')
    this.root.setAttribute('aria-hidden', 'false')
    document.getElementById('game-crosshair')?.classList.remove('is-on')
    const err = this.root.querySelector('.kos-load-error') as HTMLElement | null
    if (err) {
      err.textContent = ''
      err.hidden = true
    }
    this.showScreen('loading')
    this.setLoadingProgress(label, pct)
  }

  public showMain(): void {
    this.showScreen('main')
  }

  public getSelectedMapId(): MapId {
    return this.selectedMapId
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
    document.getElementById('game-crosshair')?.classList.add('is-on')
    document.getElementById('game-crosshair')?.classList.remove('is-awp-hidden')
    this.gameCrosshair?.resize()
  }

  public show(): void {
    this.root.classList.remove('is-hidden')
    this.root.setAttribute('aria-hidden', 'false')
    document.getElementById('game-crosshair')?.classList.remove('is-on')
    this.showScreen('main')
  }

  public showScreen(id: 'loading' | 'main' | 'bots' | 'mp' | 'settings'): void {
    this.currentScreen = id
    this.root.querySelectorAll('.kos-screen').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-screen') === id)
    })
    this.root.classList.toggle('is-bg-blur', id !== 'main')
    if (id === 'main') this.refreshCareerCard()
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

  /** Lifetime totals under the menu buttons. Hidden entirely before a first match. */
  private refreshCareerCard(): void {
    const el = this.root.querySelector('#kos-career') as HTMLElement | null
    if (!el) return
    const c = CareerStats.load()
    if (c.matches <= 0) {
      el.hidden = true
      return
    }
    const accuracy = c.shotsFired > 0 ? Math.round((c.shotsHit / c.shotsFired) * 100) : 0
    const bits: Array<[string, string]> = [
      ['Matches', String(c.matches)],
      ['Wins', String(c.wins)],
      ['K/D', ratio(c.kills, c.deaths).toFixed(2)],
      ['Kills', String(c.kills)],
      ['Accuracy', `${accuracy}%`],
      ['Best match', String(c.bestKills)],
      ['Streak', String(c.bestStreak)],
      ['Played', formatPlaytime(c.secondsPlayed)],
    ]
    el.hidden = false
    el.innerHTML =
      `<div class="kos-career-title">Your record</div><div class="kos-career-grid">` +
      bits
        .map(([label, value]) => `<div class="kos-career-bit"><b>${value}</b><span>${label}</span></div>`)
        .join('') +
      `</div>`
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
    return MAIN_MENU_HTML
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
    const mobileHint = this.root.querySelector('#kos-mfps-hint')
    if (mobileHint) mobileHint.textContent = `Running at your display's max (~${this.displayHz}Hz).`
    const v = this.settings.fpsMax
    const current = v === 60 || v === 120 || v === 144 || v === 999 ? v : 0
    this.root.querySelectorAll('[data-fps]').forEach((el) => {
      el.classList.toggle('is-on', Number((el as HTMLElement).getAttribute('data-fps')) === current)
    })
    this.syncMobileResControls()
  }

  private syncMobileResControls(): void {
    const mode = this.settings.mobile.resMode
    const res43 = this.settings.mobile.res43
    this.root.querySelectorAll('[data-mres]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-mres') === mode)
    })
    const sizeRow = this.root.querySelector('#kos-mres43-row') as HTMLElement | null
    if (sizeRow) sizeRow.hidden = mode !== '4:3'
    this.root.querySelectorAll('[data-mres43]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-mres43') === res43)
    })
    const hint = this.root.querySelector('#kos-mres-hint')
    if (hint) {
      hint.textContent =
        mode === '4:3'
          ? `4:3 — ${res43.replace('x', '×')} stretched to fill the screen, like CS.`
          : "Normal — your screen's native aspect, no stretching."
    }
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
        const roomMap = roomBtn.getAttribute('data-map-id') as MapId | null
        if (roomMap === 'pool_day' || roomMap === 'de_dust2') this.selectMap(roomMap)
        if (code) this.startMultiplayer('join', code)
        return
      }

      const t = (e.target as HTMLElement).closest(
        '[data-action], [data-diff], [data-length], [data-team], [data-mode], [data-side], [data-mp-side], [data-mp-diff], [data-mp-map], [data-tab], [data-map], [data-res], [data-mres], [data-mres43], [data-mobile-id], [data-fps], [data-hold], [data-perf], [data-gfx]'
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

      const mres = t.getAttribute('data-mres') as MobileResMode | null
      if (mres === 'normal' || mres === '4:3') {
        this.settings.mobile.resMode = mres
        this.syncMobileResControls()
        this.persist()
        try {
          Game.getInstance().applyMobileResMode(mres, this.settings.mobile.res43)
        } catch {
          /* ignore */
        }
      }

      const mres43 = t.getAttribute('data-mres43') as MobileRes43 | null
      if (mres43 === '1280x960' || mres43 === '1440x1080') {
        this.settings.mobile.res43 = mres43
        this.settings.mobile.resMode = '4:3'
        this.syncMobileResControls()
        this.persist()
        try {
          Game.getInstance().applyMobileResMode('4:3', mres43)
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
      }

      const mpMap = t.getAttribute('data-mp-map') as MapId | null
      if (mpMap === 'pool_day' || mpMap === 'de_dust2') {
        this.selectMap(mpMap)
      }

      const diff = t.getAttribute('data-diff') as BotDifficulty | null
      if (diff) {
        this.selectedDifficulty = diff
        this.root.querySelectorAll('[data-diff]').forEach((el) => el.classList.toggle('is-on', el === t))
      }

      const team = t.getAttribute('data-team') as TeamMode | 'teams' | null
      if (team) {
        this.mpTeamPlay = team === 'teams'
        this.selectedTeamMode = team === 'teams' ? 'ffa' : team
        this.root.querySelectorAll('[data-team]').forEach((el) => el.classList.toggle('is-on', el === t))
        const hint = this.root.querySelector('#kos-team-hint')
        if (hint) {
          hint.textContent =
            team === 'coop'
              ? 'Everyone who joins fights the bots with you.'
              : team === 'teams'
                ? 'T vs CT — needs Dust II. Bots fill the empty slots.'
                : 'Every player for themselves, bots included.'
        }
        if (this.mpTeamPlay) this.selectMap('de_dust2')
        this.syncTeamControls()
      }

      const mode = t.getAttribute('data-mode')
      if (mode === 'ffa' || mode === 'teams') {
        this.teamPlay = mode === 'teams'
        if (this.teamPlay) this.selectMap('de_dust2')
        this.root.querySelectorAll('[data-mode]').forEach((el) => el.classList.toggle('is-on', el === t))
        this.syncTeamControls()
      }

      const side = t.getAttribute('data-side') as Team | null
      if (side === 'T' || side === 'CT') {
        this.selectedTeam = side
        this.root.querySelectorAll('[data-side]').forEach((el) => el.classList.toggle('is-on', el === t))
        this.syncTeamControls()
      }

      const mpSide = t.getAttribute('data-mp-side') as Team | null
      if (mpSide === 'T' || mpSide === 'CT') {
        this.mpTeam = mpSide
        this.root.querySelectorAll('[data-mp-side]').forEach((el) => el.classList.toggle('is-on', el === t))
      }

      const length = t.getAttribute('data-length') as MatchLength | null
      if (length) {
        this.selectedMatchLength = length
        this.root.querySelectorAll('[data-length]').forEach((el) => el.classList.toggle('is-on', el === t))
        const hint = this.root.querySelector('#kos-length-hint')
        if (hint) hint.textContent = MATCH_LENGTHS[length].hint
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

    const teamSizeInput = this.root.querySelector('#kos-team-size') as HTMLInputElement | null
    teamSizeInput?.addEventListener('change', () => {
      this.selectedTeamSize = this.readTeamSize('#kos-team-size')
      this.syncTeamControls()
    })
    this.syncTeamControls()

    const previewCanvas = this.root.querySelector('#kos-xhair-preview') as HTMLCanvasElement
    this.crosshairPreview = new CrosshairRenderer(previewCanvas, this.settings.crosshair)
    this.buildCrosshairControls()

    // Game crosshair canvas (hidden until match). Must stay a dedicated
    // canvas — never share the WebGL #kos-gl fullscreen rules.
    document.getElementById('game-crosshair')?.remove()
    document.getElementById('kos-xh-styles')?.remove()
    const gameCanvas = document.createElement('canvas')
    gameCanvas.id = 'game-crosshair'
    document.body.appendChild(gameCanvas)
    this.gameCrosshair = new CrosshairRenderer(gameCanvas, this.settings.crosshair, 48)
    window.addEventListener('resize', () => {
      this.crosshairPreview.resize()
      this.gameCrosshair.resize()
    })
  }

  /**
   * Team play only exists on maps with authored side spawns, so the pickers and
   * the derived bot count follow whichever map is selected.
   */
  private syncTeamControls(): void {
    const supported = mapSupportsTeams(this.selectedMapId)
    if (!supported) {
      this.teamPlay = false
      this.mpTeamPlay = false
    }
    this.root.querySelectorAll('[data-mode]').forEach((el) => {
      const value = el.getAttribute('data-mode')
      el.classList.toggle('is-on', value === (this.teamPlay ? 'teams' : 'ffa'))
    })
    this.root.querySelectorAll('[data-team]').forEach((el) => {
      if (el.getAttribute('data-team') !== 'teams') return
      el.classList.toggle('is-on', this.mpTeamPlay)
    })

    const setup = this.root.querySelector('#kos-team-setup') as HTMLElement | null
    if (setup) setup.hidden = !this.teamPlay
    const mpSetup = this.root.querySelector('#kos-mp-team-setup') as HTMLElement | null
    if (mpSetup) mpSetup.hidden = !this.mpTeamPlay

    const note = this.root.querySelector('#kos-mode-note') as HTMLElement | null
    if (note) {
      note.textContent = supported
        ? 'Team Deathmatch: round wins on Dust II (freeze · eliminate · first to N).'
        : 'Team Deathmatch is Dust II only — picking it switches the map.'
    }
    const modeHint = this.root.querySelector('#kos-mode-hint') as HTMLElement | null
    if (modeHint) {
      modeHint.textContent = this.teamPlay
        ? `${TEAM_LABEL[this.selectedTeam]} — win rounds by wiping the other side.`
        : 'Free-for-all — everyone for themselves.'
    }
    const teamHint = this.root.querySelector('#kos-team-hint-bots') as HTMLElement | null
    if (teamHint) {
      const size = this.selectedTeamSize
      teamHint.textContent = `${size}v${size} — bots fill every empty slot. Teammates get a faint outline.`
    }

    // Bot count is derived from the team size once teams are on
    const countRow = this.root.querySelector('#kos-bot-count-row') as HTMLElement | null
    if (countRow) countRow.hidden = this.teamPlay
    const countHint = this.root.querySelector('#kos-bot-count-hint') as HTMLElement | null
    if (countHint) countHint.hidden = this.teamPlay
  }

  private readTeamSize(id: string): number {
    const input = this.root.querySelector(id) as HTMLInputElement | null
    const size = clampTeamSize(Number(input?.value))
    if (input) input.value = String(size)
    return size
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
          ? 'Dust II — large map, spawns spread across the site.'
          : 'Classic pool arena — bots ready.'
    }
    this.root.querySelectorAll('[data-map]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-map') === mapId)
    })
    this.root.querySelectorAll('[data-mp-map]').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-mp-map') === mapId)
    })
    this.syncTeamControls()
    this.callbacks.onMapSelected?.(mapId)
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
    this.selectedTeamSize = this.readTeamSize('#kos-team-size')
    const refill = !!(this.root.querySelector('#kos-refill-kill') as HTMLInputElement | null)?.checked
    this.persist()
    this.stopMenuAudio()
    this.callbacks.onPlayBots({
      difficulty: this.selectedDifficulty,
      botCount: this.selectedBotCount,
      playerName: this.settings.playerName,
      refillAmmoOnKill: refill,
      mapId: this.selectedMapId,
      matchLength: this.selectedMatchLength,
      teamPlay: this.teamPlay,
      playerTeam: this.selectedTeam,
      teamSize: this.selectedTeamSize,
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
      matchLength: this.selectedMatchLength,
      teamMode: this.selectedTeamMode,
      mapId: this.selectedMapId,
      teamPlay: this.mpTeamPlay,
      playerTeam: this.mpTeam,
      teamSize: this.readTeamSize('#kos-mp-team-size'),
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
      btn.setAttribute('data-map-id', room.mapId === 'de_dust2' ? 'de_dust2' : 'pool_day')
      btn.innerHTML = `
        <span class="kos-mp-room-name">${this.escapeHtml(room.name)}</span>
        <span class="kos-mp-room-meta">${room.mapId === 'de_dust2' ? 'Dust II' : 'Pool Day'} · ${room.players}/${room.max}</span>
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
    style.textContent = MAIN_MENU_CSS
    document.head.appendChild(style)
  }
}
