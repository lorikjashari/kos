import { Player } from '../../Core/Player'
import { WeaponIconRenderer } from './WeaponIconRenderer'
import { Game } from '../../Game'
import { isTouchDevice } from '../../UI/MobileDevice'
import { formatClock, formatPlaytime, ordinal, ratio, type MatchResult } from '../../Core/MatchStats'
import { calloutAt } from '../../Core/Dust2Callouts'
import { GAME_HUD_CSS } from './GameHUDStyles'
import { CS_GREEN_HUD_CSS } from './CsGreenYellowHudStyles'
import { CsGreenYellowHud } from './CsGreenYellowHud'
import type { HudStyle } from '../../UI/SettingsStore'

type FeedPush = {
  killer: string
  victim: string
  weaponKey: string
  headshot: boolean
  assist?: string
  isLocal: boolean
}

export type MatchStatus = {
  kills: number
  leaderKills: number
  killLimit: number
  /** null when the mode has no clock */
  secondsLeft: number | null
  /** Set only in team deathmatch */
  teams?: { you: 'T' | 'CT'; T: number; CT: number } | null
  mode?: 'kills' | 'rounds'
}

export class GameHUD {
  private root: HTMLElement
  private topRoot: HTMLElement
  private ammoMagEl!: HTMLElement
  private ammoReserveEl!: HTMLElement
  private weaponIconEl!: HTMLImageElement
  private knifeIconEl!: HTMLImageElement
  private healthText!: HTMLElement
  private healthFill!: HTMLElement
  private ammoFill!: HTMLElement
  private armorWrapEl!: HTMLElement
  private armorText!: HTMLElement
  private armorFill!: HTMLElement
  private iconRenderer = new WeaponIconRenderer()
  private lastAmmo = -1
  private lastWeapon = ''
  private iconsReady = false
  private hitmarkerEl!: HTMLElement
  private hitmarkerTimer = 0
  private damageFlashEl!: HTMLElement
  private deathEl!: HTMLElement
  private deathTitleEl!: HTMLElement
  private deathSubEl!: HTMLElement
  private deathCountdownEl!: HTMLElement
  private deathRingEl!: HTMLElement | null
  private deathRespawnTotal = 4
  private lockdownEl!: HTMLElement
  private lockdownNumEl!: HTMLElement
  private lockdownLabelEl!: HTMLElement
  private loadoutEl!: HTMLElement
  private loadoutPickHandler: ((primary: 'AK47' | 'AWP') => void) | null = null
  private killFeedEl!: HTMLElement
  private scoreboardEl!: HTMLElement
  private sbRowsEl!: HTMLElement
  private pauseMenuEl!: HTMLElement
  private pauseBtnEl!: HTMLElement
  private matchBarEl!: HTMLElement
  private matchYouEl!: HTMLElement
  private matchGoalEl!: HTMLElement
  private matchClockEl!: HTMLElement
  private matchLeadEl!: HTMLElement
  private resultEl!: HTMLElement
  private resultHandlers: { onRematch: () => void; onMenu: () => void } | null = null
  private lastMatchStatusKey = ''
  private damageFlashUntil = 0
  private lastHealthShown = 100
  private lastReserve = -1
  private lastArmorShown = -1
  private lastCallout = ''
  private deathShown = false
  private lastLockdownShown = -1
  private feedId = 0
  private readonly feedLifetimeMs = 4200
  private readonly maxFeed = 5
  private readonly csGreenHud = new CsGreenYellowHud()
  private hudStyle: HudStyle = 'cs-green'

  constructor() {
    document.getElementById('game-hud')?.remove()
    document.getElementById('game-hud-top')?.remove()
    this.ensureStyles()
    this.root = document.createElement('div')
    this.root.id = 'game-hud'
    this.root.innerHTML = `
      <div class="kos-brand">KoS</div>

      <div class="cs-bottom-left">
        <div class="cs-vital">
          <div class="cs-vital-icon">+</div>
          <div class="cs-vital-main">
            <div class="cs-vital-num" id="hud-hp">100</div>
            <div class="cs-vital-bar"><div class="cs-vital-fill" id="hud-hp-fill"></div></div>
          </div>
        </div>
        <div class="cs-vital cs-vital-armor" id="hud-armor-wrap" aria-hidden="true">
          <div class="cs-vital-icon is-armor">◈</div>
          <div class="cs-vital-main">
            <div class="cs-vital-num" id="hud-armor">0</div>
            <div class="cs-vital-bar"><div class="cs-vital-fill is-armor" id="hud-armor-fill"></div></div>
          </div>
        </div>
      </div>

      <div class="cs-bottom-right">
        <div class="cs-weapon-row">
          <img id="hud-knife-icon" class="cs-knife-icon" alt="" draggable="false" />
          <img id="hud-weapon-icon" class="cs-weapon-icon" alt="" draggable="false" />
        </div>
        <div class="cs-ammo-main">
          <div class="cs-ammo-row">
            <span class="cs-ammo-mag" id="hud-ammo">30</span>
            <span class="cs-ammo-sep">/</span>
            <span class="cs-ammo-reserve" id="hud-reserve">90</span>
          </div>
          <div class="cs-ammo-bar"><div class="cs-ammo-fill" id="hud-ammo-fill"></div></div>
        </div>
      </div>

      <div class="cs-matchbar" id="hud-matchbar" aria-hidden="true">
        <div class="cs-matchbar-score">
          <span class="cs-matchbar-you" id="hud-match-you">0</span>
          <span class="cs-matchbar-slash">/</span>
          <span class="cs-matchbar-goal" id="hud-match-goal">30</span>
        </div>
        <div class="cs-matchbar-sep"></div>
        <div class="cs-matchbar-clock" id="hud-match-clock">10:00</div>
        <div class="cs-matchbar-lead" id="hud-match-lead"></div>
      </div>

      <div class="cs-teambar" id="hud-teambar" aria-hidden="true">
        <div class="cs-teambar-side is-t" id="hud-team-t">
          <span class="cs-teambar-tag">T</span>
          <span class="cs-teambar-score" id="hud-team-t-score">0</span>
        </div>
        <div class="cs-teambar-vs">vs</div>
        <div class="cs-teambar-side is-ct" id="hud-team-ct">
          <span class="cs-teambar-score" id="hud-team-ct-score">0</span>
          <span class="cs-teambar-tag">CT</span>
        </div>
      </div>

      <div class="cs-callout" id="hud-callout" aria-live="polite" aria-hidden="true"></div>
      <div class="cs-round-banner" id="hud-round-banner" aria-live="polite" aria-hidden="true"></div>
      <div class="cs-spectate" id="hud-spectate" aria-live="polite" aria-hidden="true"></div>

      <div class="cs-killfeed" id="hud-killfeed" aria-live="polite"></div>

      <div class="cs-lockdown" id="hud-lockdown" aria-hidden="true">
        <div class="cs-lockdown-num" id="hud-lockdown-num">3</div>
        <div class="cs-lockdown-label" id="hud-lockdown-label">Get ready</div>
      </div>

      <div class="cs-hitmarker" id="hud-hitmarker" aria-hidden="true"></div>
      <div class="cs-damage-flash" id="hud-damage-flash" aria-hidden="true"></div>
      <div class="cs-death" id="hud-death" aria-hidden="true">
        <div class="cs-death-vignette"></div>
        <div class="cs-death-scan"></div>
        <div class="cs-death-panel">
          <div class="cs-death-brand">KoS</div>
          <div class="cs-death-kicker">Eliminated</div>
          <div class="cs-death-title" id="hud-death-title">Out of the fight</div>
          <div class="cs-death-line"></div>
          <div class="cs-death-timer">
            <div class="cs-death-ring" id="hud-death-ring" style="--p:1">
              <span class="cs-death-countdown" id="hud-death-countdown">4.0</span>
            </div>
            <div class="cs-death-sub" id="hud-death-sub">Respawning</div>
          </div>
        </div>
      </div>
    `

    this.topRoot = document.createElement('div')
    this.topRoot.id = 'game-hud-top'
    this.topRoot.innerHTML = `
      <div class="cs-pause-backdrop" id="hud-pause-backdrop" aria-hidden="true">
        <div class="cs-pause-label">PAUSED</div>
        <div class="cs-pause-sub" id="hud-pause-sub">Esc or Resume to continue</div>
      </div>

      <div class="cs-pause-menu" id="hud-pause">
        <button type="button" class="cs-pause-btn" id="hud-pause-btn" title="Menu" aria-label="Open menu">
          <span></span><span></span>
        </button>
        <div class="cs-pause-panel" id="hud-pause-panel" aria-hidden="true">
          <button type="button" class="cs-pause-opt" data-pause="resume">Resume</button>
          <button type="button" class="cs-pause-opt" data-pause="scores" data-touch-only>Scores</button>
          <button type="button" class="cs-pause-opt" data-pause="menu">Back to menu</button>
        </div>
      </div>

      <div class="cs-scoreboard" id="hud-scoreboard" aria-hidden="true">
        <div class="cs-sb-panel">
          <div class="cs-sb-top">
            <div class="cs-sb-title">Scoreboard</div>
            <div class="cs-sb-hint" id="hud-sb-hint">Hold Tab</div>
          </div>
          <div class="cs-sb-head">
            <span class="cs-sb-col rank">#</span>
            <span class="cs-sb-col name">Player</span>
            <span class="cs-sb-col">K</span>
            <span class="cs-sb-col">D</span>
            <span class="cs-sb-col">A</span>
          </div>
          <div class="cs-sb-rows" id="hud-sb-rows"></div>
        </div>
      </div>

      <div class="cs-result" id="hud-result" aria-hidden="true">
        <div class="cs-result-panel">
          <div class="cs-result-kicker" id="hud-result-kicker">Match over</div>
          <div class="cs-result-title" id="hud-result-title">Victory</div>
          <div class="cs-result-sub" id="hud-result-sub"></div>

          <div class="cs-result-stats" id="hud-result-stats"></div>

          <div class="cs-result-board">
            <div class="cs-result-head">
              <span class="cs-sb-col rank">#</span>
              <span class="cs-sb-col name">Player</span>
              <span class="cs-sb-col">K</span>
              <span class="cs-sb-col">D</span>
              <span class="cs-sb-col">A</span>
            </div>
            <div class="cs-result-rows" id="hud-result-rows"></div>
          </div>

          <div class="cs-result-career" id="hud-result-career"></div>

          <div class="cs-result-actions">
            <button type="button" class="cs-result-btn is-primary" data-result="rematch">Play again</button>
            <button type="button" class="cs-result-btn" data-result="menu">Back to menu</button>
          </div>
        </div>
      </div>

      <div class="cs-loadout" id="hud-loadout" aria-hidden="true">
        <div class="cs-loadout-title">Choose loadout</div>
        <div class="cs-loadout-sub" id="hud-loadout-sub">Press <kbd>1</kbd> for AWP · <kbd>2</kbd> for AK</div>
        <div class="cs-loadout-row">
          <button type="button" class="cs-loadout-box" data-primary="AWP">
            <div class="cs-loadout-guns">
              <img class="cs-loadout-icon" data-icon="AWP" alt="" draggable="false" />
              <span class="cs-loadout-plus">+</span>
              <img class="cs-loadout-icon is-side" data-icon="Usp" alt="" draggable="false" />
            </div>
            <div class="cs-loadout-name">AWP + USP</div>
            <div class="cs-loadout-hint">Sniper rifle</div>
          </button>
          <button type="button" class="cs-loadout-box" data-primary="AK47">
            <div class="cs-loadout-guns">
              <img class="cs-loadout-icon" data-icon="AK47" alt="" draggable="false" />
              <span class="cs-loadout-plus">+</span>
              <img class="cs-loadout-icon is-side" data-icon="Usp" alt="" draggable="false" />
            </div>
            <div class="cs-loadout-name">AK + USP</div>
            <div class="cs-loadout-hint">Assault rifle</div>
          </button>
        </div>
      </div>
    `
    document.body.appendChild(this.root)
    document.body.appendChild(this.topRoot)
    this.root.style.display = 'none'
    this.topRoot.style.display = 'none'
    this.bind()
    this.applyTouchUiHints()
    requestAnimationFrame(() => this.bakeIcons())
  }

  private applyTouchUiHints(): void {
    const touch = isTouchDevice()
    this.root.classList.toggle('is-touch', touch)
    this.topRoot.classList.toggle('is-touch', touch)
    const hint = document.getElementById('hud-sb-hint')
    if (hint) hint.textContent = touch ? 'Pause → Scores' : 'Hold Tab'
    const loadoutSub = document.getElementById('hud-loadout-sub')
    if (loadoutSub) {
      loadoutSub.innerHTML = touch
        ? 'Tap a loadout below'
        : 'Press <kbd>1</kbd> for AWP · <kbd>2</kbd> for AK'
    }
    const pauseSub = document.getElementById('hud-pause-sub')
    if (pauseSub) {
      pauseSub.textContent = touch ? 'Tap Resume to continue' : 'Esc or Resume to continue'
    }
  }

  /** Show HUD once a match starts from the main menu */
  public showGameplay(): void {
    this.root.style.display = ''
    this.topRoot.style.display = ''
    if (this.killFeedEl) this.killFeedEl.innerHTML = ''
    this.setScoreboardVisible(false)
    this.setPauseMenuOpen(false)
    void this.applyHudStyle(this.hudStyle)
  }

  public setHudStyle(style: HudStyle): void {
    this.hudStyle = style
    if (this.root.style.display !== 'none') {
      void this.applyHudStyle(style)
    }
  }

  private async applyHudStyle(style: HudStyle): Promise<void> {
    if (style === 'cs-green') {
      await this.csGreenHud.ensureLoaded()
      this.csGreenHud.apply(this.root)
    } else {
      this.csGreenHud.remove(this.root)
    }
  }

  private bind(): void {
    this.ammoMagEl = document.getElementById('hud-ammo')!
    this.ammoReserveEl = document.getElementById('hud-reserve')!
    this.weaponIconEl = document.getElementById('hud-weapon-icon') as HTMLImageElement
    this.knifeIconEl = document.getElementById('hud-knife-icon') as HTMLImageElement
    this.healthText = document.getElementById('hud-hp')!
    this.healthFill = document.getElementById('hud-hp-fill')!
    this.ammoFill = document.getElementById('hud-ammo-fill')!
    this.armorWrapEl = document.getElementById('hud-armor-wrap')!
    this.armorText = document.getElementById('hud-armor')!
    this.armorFill = document.getElementById('hud-armor-fill')!
    this.hitmarkerEl = document.getElementById('hud-hitmarker')!
    this.damageFlashEl = document.getElementById('hud-damage-flash')!
    this.deathEl = document.getElementById('hud-death')!
    this.deathTitleEl = document.getElementById('hud-death-title')!
    this.deathSubEl = document.getElementById('hud-death-sub')!
    this.deathCountdownEl = document.getElementById('hud-death-countdown')!
    this.deathRingEl = document.getElementById('hud-death-ring')
    this.lockdownEl = document.getElementById('hud-lockdown')!
    this.lockdownNumEl = document.getElementById('hud-lockdown-num')!
    this.lockdownLabelEl = document.getElementById('hud-lockdown-label')!
    this.loadoutEl = document.getElementById('hud-loadout')!
    this.killFeedEl = document.getElementById('hud-killfeed')!
    this.matchBarEl = document.getElementById('hud-matchbar')!
    this.matchYouEl = document.getElementById('hud-match-you')!
    this.matchGoalEl = document.getElementById('hud-match-goal')!
    this.matchClockEl = document.getElementById('hud-match-clock')!
    this.matchLeadEl = document.getElementById('hud-match-lead')!
    this.resultEl = document.getElementById('hud-result')!
    this.resultEl.querySelectorAll('[data-result]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const action = (btn as HTMLElement).dataset.result
        if (action === 'rematch') this.resultHandlers?.onRematch()
        else this.resultHandlers?.onMenu()
      })
    })
    const blockSelect = (e: Event) => e.preventDefault()
    for (const el of [this.root, this.topRoot]) {
      el.addEventListener('selectstart', blockSelect)
      el.addEventListener('contextmenu', blockSelect)
      el.addEventListener('dragstart', blockSelect)
    }
    this.loadoutEl.querySelectorAll('[data-primary]').forEach((btn) => {
      const pick = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        const primary = (btn as HTMLElement).getAttribute('data-primary')
        if (primary !== 'AK47' && primary !== 'AWP') return
        const handler = this.loadoutPickHandler
        if (!handler) return
        this.loadoutPickHandler = null
        handler(primary)
      }
      btn.addEventListener('pointerup', pick)
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (this.loadoutPickHandler) pick(e)
      })
    })
    this.scoreboardEl = document.getElementById('hud-scoreboard')!
    this.sbRowsEl = document.getElementById('hud-sb-rows')!
    this.pauseMenuEl = document.getElementById('hud-pause')!
    this.pauseBtnEl = document.getElementById('hud-pause-btn')!
    this.scoreboardEl.addEventListener('pointerup', (e) => {
      if (!this.scoreboardEl?.classList.contains('is-on')) return
      if ((e.target as HTMLElement).closest('.cs-sb-panel')) return
      e.preventDefault()
      e.stopPropagation()
      this.setScoreboardVisible(false)
    })

    const onPauseToggle = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      this.pauseBtnEl?.blur()
      const game = Game.getInstance()
      if (game.matchPaused) game.resumeMatch()
      else game.pauseMatch()
    }
    this.pauseBtnEl.addEventListener('pointerup', onPauseToggle)
    this.pauseBtnEl.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })

    this.pauseMenuEl.querySelectorAll('[data-pause]').forEach((btn) => {
      const run = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        const action = (btn as HTMLElement).getAttribute('data-pause')
        const game = Game.getInstance()
        if (action === 'resume') game.resumeMatch()
        if (action === 'scores') {
          const on = !this.scoreboardEl?.classList.contains('is-on')
          this.setScoreboardVisible(on)
        }
        if (action === 'menu') game.returnToMenu()
      }
      btn.addEventListener('pointerup', run)
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
    })

  }

  public setPauseMenuOpen(open: boolean): void {
    if (!this.pauseMenuEl) return
    this.pauseMenuEl.classList.toggle('is-open', open)
    this.pauseBtnEl?.classList.toggle('is-active', open)
    const panel = document.getElementById('hud-pause-panel')
    panel?.setAttribute('aria-hidden', open ? 'false' : 'true')
    const backdrop = document.getElementById('hud-pause-backdrop')
    backdrop?.classList.toggle('is-on', open)
    backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true')
    this.syncTopLayer()
    if (!open) this.setScoreboardVisible(false)
  }

  public toggleScoreboard(): void {
    const on = !this.scoreboardEl?.classList.contains('is-on')
    this.setScoreboardVisible(on)
  }

  public setScoreboardVisible(visible: boolean): void {
    if (!this.scoreboardEl) return
    this.scoreboardEl.classList.toggle('is-on', visible)
    this.scoreboardEl.setAttribute('aria-hidden', visible ? 'false' : 'true')
    if (visible) this.refreshScoreboard()
    this.syncTopLayer()
    document.getElementById('kos-mobile-controls')?.classList.toggle('is-scores', visible)
  }

  private syncTopLayer(): void {
    const pauseOn = !!this.pauseMenuEl?.classList.contains('is-open')
    const scoresOn = !!this.scoreboardEl?.classList.contains('is-on')
    const resultOn = this.isMatchResultOpen()
    this.topRoot.style.zIndex = pauseOn || scoresOn || resultOn ? '50' : ''
    // The pause button must not sit on top of the results panel
    this.pauseMenuEl?.classList.toggle('is-hidden', resultOn)
  }

  private refreshScoreboard(): void {
    if (!this.sbRowsEl) return
    const rows = Game.getInstance().getScoreboardRows()
    this.sbRowsEl.innerHTML = rows
      .map(
        (r, i) => `
      <div class="cs-sb-row ${r.isYou ? 'is-you' : ''} ${r.team ? `team-${r.team.toLowerCase()}` : ''}">
        <span class="cs-sb-col rank">${i + 1}</span>
        <span class="cs-sb-col name">${
          r.team ? `<i class="cs-sb-team">${r.team}</i>` : ''
        }${this.escapeHtml(r.name)}${r.isYou ? '<em>YOU</em>' : ''}</span>
        <span class="cs-sb-col">${r.kills}</span>
        <span class="cs-sb-col">${r.deaths}</span>
        <span class="cs-sb-col">${r.assists}</span>
      </div>`
      )
      .join('')
  }

  /** Compact KoS kill feed — only local kills / assists */
  public pushKillFeed(entry: FeedPush): void {
    if (!this.killFeedEl || !entry.isLocal) return
    const id = ++this.feedId
    const row = document.createElement('div')
    row.className = 'cs-feed-row'
    row.dataset.id = String(id)

    const weaponIcon = this.iconRenderer.getIcon(entry.weaponKey) || ''
    const headSvg = entry.headshot
      ? `<span class="cs-feed-hs" title="Headshot"><svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="6" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 14c1.2-2.4 2.8-3.5 5-3.5s3.8 1.1 5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 7.5h12" stroke="#e74c3c" stroke-width="1.6"/></svg></span>`
      : ''
    const assist = entry.assist
      ? `<span class="cs-feed-assist">+${this.escapeHtml(entry.assist)}</span>`
      : ''

    row.innerHTML = `
      <span class="cs-feed-killer">${this.escapeHtml(entry.killer)}</span>
      ${assist}
      ${weaponIcon ? `<img class="cs-feed-gun" src="${weaponIcon}" alt="" />` : `<span class="cs-feed-gun-fallback">${this.escapeHtml(entry.weaponKey)}</span>`}
      ${headSvg}
      <span class="cs-feed-victim">${this.escapeHtml(entry.victim)}</span>
    `
    this.killFeedEl.prepend(row)
    while (this.killFeedEl.children.length > this.maxFeed) {
      this.killFeedEl.lastElementChild?.remove()
    }
    requestAnimationFrame(() => row.classList.add('is-in'))
    window.setTimeout(() => {
      row.classList.add('is-out')
      window.setTimeout(() => row.remove(), 280)
    }, this.feedLifetimeMs)
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  public setLockdown(secondsLeft: number | null): void {
    if (!this.lockdownEl) return
    if (secondsLeft === null || secondsLeft <= 0) {
      this.lockdownEl.classList.remove('is-on')
      this.lockdownEl.setAttribute('aria-hidden', 'true')
      this.lastLockdownShown = -1
      return
    }
    this.lockdownEl.classList.add('is-on')
    this.lockdownEl.setAttribute('aria-hidden', 'false')
    const n = Math.ceil(secondsLeft)
    if (n !== this.lastLockdownShown) {
      this.lastLockdownShown = n
      this.lockdownNumEl.textContent = String(n)
      this.lockdownNumEl.classList.remove('pop')
      void this.lockdownNumEl.offsetWidth
      this.lockdownNumEl.classList.add('pop')
      this.lockdownLabelEl.textContent = n > 1 ? 'Lockdown' : 'Fight!'
    }
  }

  /** Pre-countdown loadout: AWP+USP or AK+USP */
  public showLoadoutPicker(onPick: (primary: 'AK47' | 'AWP') => void): void {
    if (!this.loadoutEl) return
    this.loadoutPickHandler = onPick
    this.bakeIcons()
    this.loadoutEl.querySelectorAll<HTMLImageElement>('[data-icon]').forEach((img) => {
      const key = img.getAttribute('data-icon') || ''
      const src = this.iconRenderer.getIcon(key)
      if (src) img.src = src
    })
    this.loadoutEl.classList.add('is-on')
    this.loadoutEl.setAttribute('aria-hidden', 'false')
    document.getElementById('game-crosshair')?.classList.add('is-awp-hidden')
  }

  public hideLoadoutPicker(): void {
    this.loadoutPickHandler = null
    if (!this.loadoutEl) return
    this.loadoutEl.classList.remove('is-on')
    this.loadoutEl.setAttribute('aria-hidden', 'true')
    document.getElementById('game-crosshair')?.classList.remove('is-awp-hidden')
  }

  public showHitMarker(isHead = false): void {
    if (!this.hitmarkerEl) return
    this.hitmarkerEl.classList.toggle('is-head', isHead)
    this.hitmarkerEl.classList.remove('is-on')
    void this.hitmarkerEl.offsetWidth
    this.hitmarkerEl.classList.add('is-on')
    this.hitmarkerTimer = performance.now() + 140
  }

  public flashDamage(amount = 20): void {
    if (!this.damageFlashEl) return
    const strength = Math.min(0.65, 0.2 + amount / 80)
    this.damageFlashEl.style.opacity = String(strength)
    this.damageFlashEl.classList.add('is-on')
    this.damageFlashUntil = performance.now() + 180
  }

  public showDeath(respawnDelay = 4): void {
    if (!this.deathEl) return
    this.deathShown = true
    this.deathRespawnTotal = Math.max(0.1, respawnDelay)
    this.root.classList.add('is-dead')
    this.root.style.zIndex = '50'
    this.deathEl.classList.add('is-on')
    this.deathEl.setAttribute('aria-hidden', 'false')
    if (this.deathCountdownEl) {
      this.deathCountdownEl.textContent = respawnDelay.toFixed(1)
    }
    if (this.deathRingEl) this.deathRingEl.style.setProperty('--p', '1')
    if (this.deathSubEl) this.deathSubEl.textContent = 'Respawning'
  }

  public showDeathSpectate(): void {
    if (!this.deathEl) return
    this.deathShown = true
    this.root.classList.add('is-dead')
    this.root.style.zIndex = '50'
    this.deathEl.classList.add('is-on')
    this.deathEl.setAttribute('aria-hidden', 'false')
    if (this.deathCountdownEl) this.deathCountdownEl.textContent = '•'
    if (this.deathRingEl) this.deathRingEl.style.setProperty('--p', '0')
    if (this.deathSubEl) this.deathSubEl.textContent = 'Scroll to cycle · wait for next round'
  }

  public setRoundBanner(text: string | null): void {
    const el = document.getElementById('hud-round-banner')
    if (!el) return
    if (!text) {
      el.textContent = ''
      el.classList.remove('is-on')
      el.setAttribute('aria-hidden', 'true')
      return
    }
    el.textContent = text
    el.classList.add('is-on')
    el.setAttribute('aria-hidden', 'false')
  }

  public setSpectateLabel(text: string | null): void {
    const el = document.getElementById('hud-spectate')
    if (!el) return
    if (!text) {
      el.textContent = ''
      el.classList.remove('is-on')
      el.setAttribute('aria-hidden', 'true')
      return
    }
    el.textContent = text
    el.classList.add('is-on')
    el.setAttribute('aria-hidden', 'false')
  }

  public hideDeath(): void {
    if (!this.deathEl) return
    this.deathShown = false
    this.root.classList.remove('is-dead')
    this.root.style.zIndex = ''
    this.deathEl.classList.remove('is-on')
    this.deathEl.setAttribute('aria-hidden', 'true')
  }

  private updateDeathHud(player: Player): void {
    if (!player.isDead) {
      if (this.deathShown) this.hideDeath()
      return
    }
    if (Game.getInstance().shouldHoldRespawn()) {
      if (!this.deathShown) this.showDeathSpectate()
      return
    }
    if (!this.deathShown) this.showDeath(player.deathRespawnDelay)
    const left = Math.max(0, player.deathTimer)
    const p = Math.max(0, Math.min(1, left / this.deathRespawnTotal))
    if (this.deathCountdownEl) {
      this.deathCountdownEl.textContent = left.toFixed(1)
    }
    if (this.deathRingEl) this.deathRingEl.style.setProperty('--p', String(p))
    if (this.deathSubEl) {
      this.deathSubEl.textContent = left > 0.15 ? 'Respawning' : 'Stand by'
    }
  }

  private bakeIcons(): void {
    const ak = this.iconRenderer.getIcon('AK47')
    const awp = this.iconRenderer.getIcon('AWP')
    const usp = this.iconRenderer.getIcon('Usp')
    const knife = this.iconRenderer.getIcon('Knife')
    if (ak) this.weaponIconEl.src = ak
    if (knife) this.knifeIconEl.src = knife
    // Prefill loadout picker images
    this.loadoutEl?.querySelectorAll<HTMLImageElement>('[data-icon]').forEach((img) => {
      const key = img.getAttribute('data-icon') || ''
      const src =
        key === 'AK47'
          ? ak
          : key === 'AWP'
            ? awp
            : key === 'Usp'
              ? usp
              : key === 'Knife' || key === 'Butterfly'
                ? knife
                : null
      if (src) img.src = src
    })
    void usp
    this.iconsReady = true
  }

  /** Pre-bake every weapon silhouette before combat */
  public warmWeaponIcons(): void {
    this.bakeIcons()
  }

  public clearWeaponIconCache(): void {
    this.iconRenderer.clearCache()
    this.iconsReady = false
  }

  private setWeaponIcon(weaponKey: string): void {
    const icon = this.iconRenderer.getIcon(weaponKey)
    if (icon) {
      this.weaponIconEl.src = icon
      this.weaponIconEl.style.display = ''
    }
    const sidearm = weaponKey === 'Usp' || weaponKey === 'Knife' || weaponKey === 'Butterfly'
    this.weaponIconEl.classList.toggle('is-sidearm', sidearm)
    // Small knife glyph stays knife; dim it when knife is the active weapon (big icon already shows it)
    if (this.knifeIconEl) {
      this.knifeIconEl.style.opacity =
        weaponKey === 'Knife' || weaponKey === 'Butterfly' ? '0.35' : '0.9'
    }
  }

  private ensureStyles(): void {
    document.getElementById('game-hud-styles')?.remove()
    const style = document.createElement('style')
    style.id = 'game-hud-styles'
    style.textContent = GAME_HUD_CSS + CS_GREEN_HUD_CSS
    document.head.appendChild(style)
  }

  public setMatchStatus(status: MatchStatus | null): void {
    if (!this.matchBarEl) return
    if (!status) {
      this.matchBarEl.classList.remove('is-on')
      this.matchBarEl.setAttribute('aria-hidden', 'true')
      this.setTeamScores(null)
      this.lastMatchStatusKey = ''
      return
    }
    this.setTeamScores(status.teams ?? null)
    const clock = status.secondsLeft === null ? '' : formatClock(status.secondsLeft)
    const key = `${status.kills}|${status.killLimit}|${clock}|${status.leaderKills}`
    if (key === this.lastMatchStatusKey) return
    this.lastMatchStatusKey = key

    this.matchBarEl.classList.add('is-on')
    this.matchBarEl.setAttribute('aria-hidden', 'false')
    this.matchYouEl.textContent = String(status.kills)
    this.matchGoalEl.textContent = status.killLimit > 0 ? String(status.killLimit) : '∞'
    this.matchBarEl.classList.toggle('no-goal', status.killLimit <= 0)
    this.matchClockEl.textContent = clock
    this.matchClockEl.style.display = clock ? '' : 'none'
    this.matchBarEl.querySelector<HTMLElement>('.cs-matchbar-sep')!.style.display = clock ? '' : 'none'

    const urgent = status.secondsLeft !== null && status.secondsLeft <= 30
    this.matchClockEl.classList.toggle('is-urgent', urgent)

    // Only worth showing who's ahead when it isn't you
    const behind = status.leaderKills - status.kills
    if (status.killLimit > 0 && behind > 0) {
      this.matchLeadEl.textContent = `-${behind}`
      this.matchLeadEl.classList.add('is-on')
    } else {
      this.matchLeadEl.classList.remove('is-on')
    }
    const close = status.killLimit > 0 && status.leaderKills >= status.killLimit - 3
    this.matchBarEl.classList.toggle('is-close', close)
  }

  /** Team deathmatch score strip. Passing null hides it. */
  public setTeamScores(teams: { you: 'T' | 'CT'; T: number; CT: number } | null): void {
    const bar = document.getElementById('hud-teambar')
    if (!bar) return
    if (!teams) {
      bar.classList.remove('is-on')
      bar.setAttribute('aria-hidden', 'true')
      return
    }
    bar.classList.add('is-on')
    bar.setAttribute('aria-hidden', 'false')
    document.getElementById('hud-team-t-score')!.textContent = String(teams.T)
    document.getElementById('hud-team-ct-score')!.textContent = String(teams.CT)
    document.getElementById('hud-team-t')!.classList.toggle('is-you', teams.you === 'T')
    document.getElementById('hud-team-ct')!.classList.toggle('is-you', teams.you === 'CT')
  }

  public showMatchResult(result: MatchResult, handlers: { onRematch: () => void; onMenu: () => void }): void {
    if (!this.resultEl) return
    this.resultHandlers = handlers
    this.setMatchStatus(null)
    this.hideDeath()
    this.hideLoadoutPicker()

    const kicker = document.getElementById('hud-result-kicker')!
    const title = document.getElementById('hud-result-title')!
    const sub = document.getElementById('hud-result-sub')!

    kicker.textContent =
      result.reason === 'timeLimit'
        ? 'Time up'
        : result.reason === 'roundLimit'
          ? 'Match point'
          : 'Score limit reached'
    title.textContent = result.won ? 'Victory' : `#${result.placement}`
    title.classList.toggle('is-win', result.won)
    sub.textContent = result.won
      ? `You topped the board of ${result.totalPlayers} · ${formatClock(result.durationSec)}`
      : `${ordinal(result.placement)} of ${result.totalPlayers} · ${formatClock(result.durationSec)}`

    const kd = ratio(result.kills, result.deaths)
    const stats: Array<[string, string]> = [
      ['Kills', String(result.kills)],
      ['Deaths', String(result.deaths)],
      ['Assists', String(result.assists)],
      ['K/D', kd.toFixed(2)],
      ['Accuracy', `${Math.round(result.accuracy * 100)}%`],
      ['Headshots', String(result.headshots)],
      ['Best streak', String(result.bestStreak)],
    ]
    document.getElementById('hud-result-stats')!.innerHTML = stats
      .map(
        ([label, value]) =>
          `<div class="cs-result-stat"><div class="cs-result-stat-v">${this.escapeHtml(
            value
          )}</div><div class="cs-result-stat-l">${this.escapeHtml(label)}</div></div>`
      )
      .join('')

    document.getElementById('hud-result-rows')!.innerHTML = result.rows
      .map(
        (row, i) => `
        <div class="cs-result-row${row.isYou ? ' is-you' : ''}${i === 0 ? ' is-top' : ''}">
          <span class="cs-sb-col rank">${i + 1}</span>
          <span class="cs-sb-col name">${this.escapeHtml(row.name)}</span>
          <span class="cs-sb-col">${row.kills}</span>
          <span class="cs-sb-col">${row.deaths}</span>
          <span class="cs-sb-col">${row.assists}</span>
        </div>`
      )
      .join('')

    const c = result.career
    const careerBits: Array<[string, string]> = [
      ['Matches', String(c.matches)],
      ['Wins', String(c.wins)],
      ['Lifetime K/D', ratio(c.kills, c.deaths).toFixed(2)],
      ['Best match', String(c.bestKills)],
      ['Played', formatPlaytime(c.secondsPlayed)],
    ]
    document.getElementById('hud-result-career')!.innerHTML =
      `<div class="cs-result-career-title">Career</div>` +
      careerBits
        .map(
          ([label, value]) =>
            `<div class="cs-result-career-bit"><b>${this.escapeHtml(value)}</b><span>${this.escapeHtml(
              label
            )}</span></div>`
        )
        .join('')

    this.resultEl.classList.add('is-on')
    this.resultEl.setAttribute('aria-hidden', 'false')
    this.syncTopLayer()
  }

  public hideMatchResult(): void {
    if (!this.resultEl) return
    this.resultEl.classList.remove('is-on')
    this.resultEl.setAttribute('aria-hidden', 'true')
    this.resultHandlers = null
    this.syncTopLayer()
  }

  public isMatchResultOpen(): boolean {
    return !!this.resultEl?.classList.contains('is-on')
  }

  private reserveFor(player: Player): number {
    if (player.currentWeapon.fireMode === 'melee') return 0
    return player.reserveAmmo()
  }

  public update(player: Player): void {
    if (!this.iconsReady) this.bakeIcons()

    if (this.hitmarkerEl && this.hitmarkerEl.classList.contains('is-on') && performance.now() > this.hitmarkerTimer) {
      this.hitmarkerEl.classList.remove('is-on', 'is-head')
    }
    if (this.damageFlashEl && performance.now() > this.damageFlashUntil) {
      this.damageFlashEl.classList.remove('is-on')
      this.damageFlashEl.style.opacity = '0'
    }
    this.updateDeathHud(player)

    if (this.scoreboardEl?.classList.contains('is-on')) {
      this.refreshScoreboard()
    }

    const weapon = player.currentWeapon
    const isMelee = weapon.fireMode === 'melee'

    // AWP uses the scope reticle — hide the normal crosshair while equipped
    document.getElementById('game-crosshair')?.classList.toggle('is-awp-hidden', weapon.key === 'AWP')

    this.healthText.textContent = String(Math.round(player.health))
    this.healthFill.style.transform = `scaleX(${Math.max(0, Math.min(1, player.health / 100))})`
    this.healthFill.classList.toggle('is-low', player.health <= 25)

    const armor = Math.max(0, Math.round(player.armor))
    if (armor !== this.lastArmorShown) {
      this.lastArmorShown = armor
      this.armorWrapEl.classList.toggle('is-on', armor > 0)
      this.armorWrapEl.setAttribute('aria-hidden', armor > 0 ? 'false' : 'true')
      this.armorText.textContent = String(armor)
      this.armorFill.style.transform = `scaleX(${Math.max(0, Math.min(1, armor / 100))})`
    }

    const reserve = this.reserveFor(player)
    if (this.hudStyle === 'cs-green') {
      this.csGreenHud.update(this.root, {
        health: Math.round(player.health),
        armor,
        mag: player.ammoInMag,
        reserve,
        melee: isMelee,
      })
    }

    if (weapon.key !== this.lastWeapon) {
      this.setWeaponIcon(weapon.key)
    }

    if (player.ammoInMag !== this.lastAmmo || weapon.key !== this.lastWeapon || reserve !== this.lastReserve) {
      this.lastReserve = reserve
      this.ammoMagEl.textContent = isMelee ? '—' : String(player.ammoInMag)
      this.ammoReserveEl.textContent = isMelee ? '—' : String(reserve)
      this.ammoReserveEl.classList.toggle('is-out', !isMelee && reserve <= 0)
      this.ammoMagEl.classList.toggle('is-low', !isMelee && player.ammoInMag <= 5)
      const magFraction =
        isMelee || !weapon.magazineSize ? 1 : Math.max(0, Math.min(1, player.ammoInMag / weapon.magazineSize))
      this.ammoFill.style.transform = `scaleX(${magFraction})`
      this.ammoFill.classList.toggle('is-low', !isMelee && player.ammoInMag <= 5)
      this.lastAmmo = player.ammoInMag
      this.lastWeapon = weapon.key
    }

    this.updateCallout(player)
    this.updateDynamicCrosshair(player)
  }

  private updateCallout(player: Player): void {
    const el = document.getElementById('hud-callout')
    if (!el) return
    const game = Game.getInstance()
    const live = game.matchStarted && game.activeMapId === 'de_dust2' && !player.isDead
    const name = live ? calloutAt(player.position.x, player.position.z) : null
    const next = name ?? ''
    if (next === this.lastCallout) return
    this.lastCallout = next
    el.textContent = next
    el.classList.toggle('is-on', !!next)
    el.setAttribute('aria-hidden', next ? 'false' : 'true')
  }

  private updateDynamicCrosshair(player: Player): void {
    const xr = Game.getInstance().getCrosshairRenderer()
    if (!xr) return
    const dyn =
      Game.getInstance().isDynamicCrosshairEnabled() || xr.getSettings().style === 4
    xr.setDynamicSpread(dyn && !player.isDead ? player.getSpreadCone() : 0)
  }
}
