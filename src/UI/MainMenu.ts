import type { BotDifficulty } from '../Core/TrainingBot'
import {
  DEFAULT_CROSSHAIR,
  DEFAULT_KEYBINDS,
  formatKeyLabel,
  loadSettings,
  REBINDABLE_ACTIONS,
  saveSettings,
  type CrosshairSettings,
  type PlayerSettings,
} from './SettingsStore'
import { CrosshairRenderer } from './CrosshairRenderer'
import { Key } from '../Input/KeyBinding'
import { Game } from '../Game'

export type BotMatchConfig = {
  difficulty: BotDifficulty
  botCount: number
  playerName: string
  /** Instantly refill mag to full after each bot kill */
  refillAmmoOnKill: boolean
}

type MenuCallbacks = {
  onPlayBots: (config: BotMatchConfig) => void
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
  private currentScreen: 'loading' | 'main' | 'bots' | 'settings' = 'loading'

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
    this.applyCrosshairToGame()
    this.showScreen('loading')
  }

  public getSettings(): PlayerSettings {
    return this.settings
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
    this.stopMenuAudio()
    this.root.classList.add('is-hidden')
    this.root.setAttribute('aria-hidden', 'true')
    document.getElementById('game-crosshair')?.classList.add('is-on')
  }

  public show(): void {
    this.root.classList.remove('is-hidden')
    this.root.setAttribute('aria-hidden', 'false')
    document.getElementById('game-crosshair')?.classList.remove('is-on')
    this.showScreen('main')
  }

  private showScreen(id: 'loading' | 'main' | 'bots' | 'settings'): void {
    this.currentScreen = id
    this.root.querySelectorAll('.kos-screen').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-screen') === id)
    })
    this.root.classList.toggle('is-bg-blur', id !== 'main')
    this.syncMenuMusic()
    if (id === 'settings') {
      this.renderKeybindList()
      this.syncCrosshairControls()
      this.crosshairPreview?.draw()
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

  private playClick(): void {
    this.audio()?.playMenuClick()
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
              <button type="button" class="kos-btn kos-btn-ghost-line" data-action="mp" disabled title="Coming soon">
                <span class="kos-btn-label">Multiplayer</span>
                <span class="kos-soon">Soon</span>
              </button>
              <button type="button" class="kos-btn kos-btn-ghost-line" data-action="settings">
                <span class="kos-btn-label">Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </section>

      <section class="kos-screen" data-screen="bots">
        <div class="kos-shell kos-shell-sub">
          <button type="button" class="kos-back" data-action="back-main">← Back</button>
          <div class="kos-sub-brand">
            <img class="kos-logo kos-logo-sm" src="/logo.png" alt="KoS" width="180" height="180" />
          </div>
          <h2 class="kos-heading">Play with Bots</h2>
          <p class="kos-hint">Pick difficulty and how many bots spawn around the map.</p>

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
          <p class="kos-hint tight-left">Type any amount (0–10).</p>

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
            <button type="button" class="kos-tab is-on" data-tab="crosshair">Crosshair</button>
            <button type="button" class="kos-tab" data-tab="keybinds">Keybinds</button>
          </div>

          <div class="kos-tab-panel is-on" data-panel="crosshair">
            <div class="kos-xhair-preview-wrap">
              <canvas id="kos-xhair-preview" width="120" height="120"></canvas>
              <p class="kos-hint tight">Live preview</p>
            </div>
            <div class="kos-xhair-controls" id="kos-xhair-controls"></div>
            <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-xhair">Reset Crosshair</button>
          </div>

          <div class="kos-tab-panel" data-panel="keybinds">
            <p class="kos-hint">Click a bind, then press a new key. Esc cancels.</p>
            <div class="kos-bind-list" id="kos-bind-list"></div>
            <button type="button" class="kos-btn kos-btn-ghost" data-action="reset-binds">Reset Keybinds</button>
          </div>
        </div>
      </section>
    `
  }

  private bind(): void {
    const nameInput = this.root.querySelector('#kos-name') as HTMLInputElement
    nameInput.value = this.settings.playerName
    nameInput.addEventListener('input', () => {
      this.settings.playerName = nameInput.value.trim().slice(0, 24)
      this.persist()
    })

    this.root.addEventListener('dragstart', (e) => {
      if ((e.target as HTMLElement).closest('.kos-bg')) e.preventDefault()
    })

    this.root.addEventListener(
      'pointerenter',
      (e) => {
        const t = (e.target as HTMLElement).closest(
          'button.kos-btn, button.kos-chip, button.kos-tab, button.kos-back, button.kos-bind'
        ) as HTMLButtonElement | null
        if (!t || t.disabled) return
        this.playHover()
      },
      true
    )

    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-action], [data-diff], [data-tab]') as HTMLElement | null
      if (!t) return

      const action = t.getAttribute('data-action')
      if (action || t.getAttribute('data-diff') || t.getAttribute('data-tab')) {
        if (!(t as HTMLButtonElement).disabled) this.playClick()
      }
      if (action === 'bots') this.showScreen('bots')
      if (action === 'settings') this.showScreen('settings')
      if (action === 'back-main') this.showScreen('main')
      if (action === 'start-bots') this.startBots()
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

      const diff = t.getAttribute('data-diff') as BotDifficulty | null
      if (diff) {
        this.selectedDifficulty = diff
        this.root.querySelectorAll('[data-diff]').forEach((el) => el.classList.toggle('is-on', el === t))
      }

      const tab = t.getAttribute('data-tab')
      if (tab) {
        this.root.querySelectorAll('.kos-tab').forEach((el) => el.classList.toggle('is-on', el === t))
        this.root.querySelectorAll('.kos-tab-panel').forEach((el) => {
          el.classList.toggle('is-on', el.getAttribute('data-panel') === tab)
        })
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
    this.gameCrosshair = new CrosshairRenderer(gameCanvas, this.settings.crosshair)
    window.addEventListener('resize', () => {
      this.crosshairPreview.resize()
      this.gameCrosshair.resize()
    })
  }

  private readBotCount(): number {
    const input = this.root.querySelector('#kos-bot-count') as HTMLInputElement | null
    const raw = Number(input?.value)
    if (!Number.isFinite(raw)) return 16
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
    })
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
    // Swap if another action already uses this key
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
      #kos-menu.is-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
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
      .kos-shell-settings { width: min(560px, 94vw); }
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
        font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
        color: rgba(226, 232, 240, 0.55);
      }
      .kos-hint.tight-left { margin: -8px 0 18px; font-size: 12.5px; }

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

      .kos-tabs {
        display: flex; gap: 0; width: 100%; margin: 10px 0 20px;
        border-bottom: 2px solid var(--kos-line);
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
        width: 100%; accent-color: var(--kos-blue); height: 4px; cursor: pointer;
      }

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
        position: fixed; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        z-index: 6; pointer-events: none;
        opacity: 0; visibility: hidden;
      }
      #game-crosshair.is-on { opacity: 1; visibility: visible; }

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
      @media (prefers-reduced-motion: reduce) {
        .kos-screen, .kos-logo-load, .kos-hero, .kos-menu-rail, .kos-shell-sub, .kos-tab-panel {
          animation: none !important;
        }
      }
    `
    document.head.appendChild(style)
  }
}
