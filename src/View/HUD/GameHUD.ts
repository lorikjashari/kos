import { Player } from '../../Core/Player'
import { WeaponIconRenderer } from './WeaponIconRenderer'
import { Game } from '../../Game'
import { isTouchDevice } from '../../UI/MobileDevice'
import { formatClock, formatPlaytime, ratio, type MatchResult } from '../../Core/MatchStats'

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
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
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
  private deathShown = false
  private lastLockdownShown = -1
  private feedId = 0
  private readonly feedLifetimeMs = 4200
  private readonly maxFeed = 5

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
        <div class="cs-teambar-soon" id="hud-team-soon">Bomb defusal — soon</div>
      </div>

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
        key === 'AK47' ? ak : key === 'AWP' ? awp : key === 'Usp' ? usp : key === 'Knife' ? knife : null
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
    const sidearm = weaponKey === 'Usp' || weaponKey === 'Knife'
    this.weaponIconEl.classList.toggle('is-sidearm', sidearm)
    // Small knife glyph stays knife; dim it when knife is the active weapon (big icon already shows it)
    if (this.knifeIconEl) {
      this.knifeIconEl.style.opacity = weaponKey === 'Knife' ? '0.35' : '0.9'
    }
  }

  private ensureStyles(): void {
    const existing = document.getElementById('game-hud-styles')
    if (existing) existing.remove()
    const style = document.createElement('style')
    style.id = 'game-hud-styles'
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&display=swap');
      #game-hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 30;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.35);
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
        touch-action: none;
        -webkit-font-smoothing: antialiased;
      }
      #game-hud * {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      #game-hud img {
        -webkit-user-drag: none;
        pointer-events: none;
      }

      #game-hud-top {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 45;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
      }
      #game-hud-top:not(.is-touch) [data-touch-only] { display: none !important; }

      .kos-brand {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.28em;
        color: rgba(255,255,255,0.28);
        text-shadow: none;
        pointer-events: none;
      }

      .cs-pause-backdrop {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(6px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 160ms ease, visibility 160ms ease;
      }
      .cs-pause-backdrop.is-on {
        opacity: 1;
        visibility: visible;
      }
      .cs-pause-menu.is-hidden { display: none; }
      .cs-pause-menu {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        left: max(14px, env(safe-area-inset-left));
        z-index: 5;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .cs-pause-label {
        font-size: clamp(28px, 5vw, 42px);
        font-weight: 800;
        letter-spacing: 0.28em;
        color: #e8c56a;
        text-shadow: 0 2px 0 rgba(0,0,0,0.55);
      }
      .cs-pause-sub {
        font-size: 12px;
        font-weight: 650;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.62);
      }

      .cs-pause-btn {
        width: 44px;
        height: 44px;
        min-width: 44px;
        min-height: 44px;
        appearance: none;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.45);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 0;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        -webkit-user-select: none;
        transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
      }
      .cs-pause-btn span {
        display: block;
        width: 3px;
        height: 14px;
        background: #fff;
        border-radius: 1px;
        box-shadow: 0 0 6px rgba(255,255,255,0.25);
      }
      .cs-pause-btn:hover {
        background: rgba(0,0,0,0.45);
        border-color: rgba(255,255,255,0.18);
        transform: none;
      }
      @media (hover: hover) and (pointer: fine) {
        .cs-pause-btn:hover {
          background: rgba(26, 95, 255, 0.35);
          border-color: rgba(26, 95, 255, 0.55);
          transform: translateY(-1px);
        }
      }
      .cs-pause-btn:active,
      .cs-pause-btn.is-active {
        background: rgba(26, 95, 255, 0.45);
        border-color: rgba(201, 162, 39, 0.55);
      }
      .cs-pause-panel {
        display: none;
        flex-direction: column;
        gap: 4px;
        min-width: 168px;
        padding: 8px;
        background: linear-gradient(165deg, rgba(12, 16, 28, 0.94), rgba(8, 10, 18, 0.96));
        border: 1px solid rgba(255,255,255,0.10);
        border-left: 3px solid #1a5fff;
        box-shadow: 0 16px 40px rgba(0,0,0,0.45);
        animation: kos-fade-in 180ms ease both;
      }
      .cs-pause-menu.is-open .cs-pause-panel { display: flex; }
      .cs-pause-opt {
        appearance: none;
        border: none;
        background: transparent;
        color: #fff;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-align: left;
        padding: 11px 12px;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease, transform 140ms ease;
      }
      .cs-pause-opt:hover {
        background: transparent;
        color: #fff;
        transform: none;
      }
      @media (hover: hover) and (pointer: fine) {
        .cs-pause-opt:hover {
          background: rgba(26, 95, 255, 0.18);
          color: #c9a227;
          transform: translateX(2px);
        }
      }

      /*
       * Health and ammo are mirror images of each other: number + 3px bar, same
       * baseline, same bottom inset. The shared vars keep the two sides locked
       * together when the HUD shrinks for touch.
       */
      #game-hud {
        --hud-num: 34px;
        --hud-sub: 19px;
        --hud-bar-w: 78px;
        --hud-bar-h: 3px;
        --hud-bar-gap: 4px;
        --hud-icon: 22px;
        --hud-gun: 44px;
        --hud-inset: 16px;
        --hud-lift: 0px;
      }
      .cs-bottom-left,
      .cs-bottom-right {
        position: absolute;
        bottom: calc(max(var(--hud-inset), env(safe-area-inset-bottom)) + var(--hud-lift));
        display: flex;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
      }
      .cs-bottom-left {
        left: max(var(--hud-inset), env(safe-area-inset-left));
        align-items: flex-start;
      }
      .cs-bottom-right {
        right: max(var(--hud-inset), env(safe-area-inset-right));
        align-items: flex-end;
      }
      .cs-vital {
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }
      .cs-vital-icon {
        width: var(--hud-icon);
        height: var(--hud-icon);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--hud-icon);
        font-weight: 800;
        line-height: 1;
        color: #fff;
        flex-shrink: 0;
        margin-bottom: calc(var(--hud-bar-h) + var(--hud-bar-gap));
      }
      .cs-vital-main,
      .cs-ammo-main {
        display: flex;
        flex-direction: column;
        gap: var(--hud-bar-gap);
      }
      .cs-ammo-main { align-items: flex-end; }
      .cs-vital-num,
      .cs-ammo-mag {
        font-size: var(--hud-num);
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
      }
      .cs-vital-bar,
      .cs-ammo-bar {
        height: var(--hud-bar-h);
        width: var(--hud-bar-w);
        background: rgba(255,255,255,0.18);
        overflow: hidden;
      }
      .cs-vital-fill,
      .cs-ammo-fill {
        height: 100%;
        width: 100%;
        background: #fff;
        transition: transform 120ms linear;
      }
      .cs-vital-fill { transform-origin: left center; }
      .cs-ammo-fill { transform-origin: right center; }
      .cs-vital-fill.is-low { background: #ff4d4d; }
      .cs-ammo-fill.is-low { background: #ff5555; }
      .cs-ammo-reserve.is-out { color: #ff6b6b; }

      .cs-vital-armor { display: none; }
      .cs-vital-armor.is-on { display: flex; }
      .cs-vital-icon.is-armor { color: #8fc3ff; font-size: calc(var(--hud-icon) * 0.85); }
      .cs-vital-fill.is-armor { background: #6fb2ff; }
      .cs-vital-armor .cs-vital-num { font-size: calc(var(--hud-num) * 0.62); opacity: 0.92; }
      .cs-vital-armor .cs-vital-bar { width: calc(var(--hud-bar-w) * 0.72); }

      .cs-weapon-row {
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        gap: 8px;
        min-height: var(--hud-gun);
      }
      .cs-weapon-icon {
        height: var(--hud-gun);
        width: auto;
        max-width: 150px;
        object-fit: contain;
        object-position: right center;
        filter: brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.5));
      }
      .cs-weapon-icon.is-sidearm {
        height: calc(var(--hud-gun) * 1.3);
        max-width: 170px;
      }
      .cs-knife-icon {
        height: calc(var(--hud-gun) * 0.6);
        width: auto;
        max-width: 56px;
        object-fit: contain;
        filter: brightness(0) saturate(100%) invert(72%) sepia(55%) saturate(500%) hue-rotate(5deg);
        opacity: 0.9;
      }
      .cs-ammo-row {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-variant-numeric: tabular-nums;
      }
      .cs-ammo-mag.is-low { color: #ff5555; text-shadow: 0 0 12px rgba(255,60,60,0.45); }
      .cs-ammo-sep {
        font-size: var(--hud-sub);
        opacity: 0.55;
        margin: 0 3px;
        font-weight: 600;
      }
      .cs-ammo-reserve {
        font-size: var(--hud-sub);
        font-weight: 700;
        opacity: 0.85;
      }

      .cs-hitmarker {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 18px;
        height: 18px;
        margin: 0;
        transform: translate(-50%, -50%) scale(1);
        opacity: 0;
        pointer-events: none;
      }
      .cs-hitmarker.is-on {
        opacity: 1;
        animation: cs-hit-pop 140ms ease-out;
      }
      @keyframes cs-hit-pop {
        0% { transform: translate(-50%, -50%) scale(1.32); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
      .cs-hitmarker::before,
      .cs-hitmarker::after {
        content: '';
        position: absolute;
        background: #fff;
        box-shadow: 0 0 2px #000;
      }
      .cs-hitmarker::before {
        left: 7px;
        top: 0;
        width: 2px;
        height: 18px;
        transform: rotate(45deg);
      }
      .cs-hitmarker::after {
        left: 0;
        top: 7px;
        width: 18px;
        height: 2px;
        transform: rotate(45deg);
      }
      .cs-hitmarker.is-head::before,
      .cs-hitmarker.is-head::after {
        background: #ff3333;
        box-shadow: 0 0 3px rgba(0,0,0,0.85);
      }

      .cs-damage-flash {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(ellipse at center, transparent 35%, rgba(160, 0, 0, 0.75) 100%);
        transition: opacity 60ms linear;
      }
      .cs-damage-flash.is-on { opacity: 1; }

      .cs-loadout {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        background:
          radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.72) 100%);
        transition: opacity 160ms ease, visibility 160ms ease;
        z-index: 50;
        touch-action: manipulation;
      }
      .cs-loadout.is-on {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
      .cs-loadout-title {
        font-size: clamp(22px, 3.4vw, 34px);
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fff;
      }
      .cs-loadout-sub {
        margin-top: -8px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.55);
      }
      .cs-loadout-sub kbd {
        display: inline-block;
        min-width: 1.4em;
        padding: 1px 6px;
        margin: 0 2px;
        border: 1px solid rgba(255,255,255,0.25);
        background: rgba(255,255,255,0.08);
        font: inherit;
        text-align: center;
      }
      .cs-loadout-row {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        justify-content: center;
        padding: 8px 20px 0;
      }
      .cs-loadout-box {
        width: min(280px, 42vw);
        min-width: 200px;
        padding: 22px 20px 18px;
        border: 1px solid rgba(255,255,255,0.16);
        background: linear-gradient(180deg, rgba(28,32,40,0.92), rgba(12,14,18,0.94));
        color: #fff;
        cursor: pointer;
        text-align: center;
        pointer-events: auto;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
      }
      .cs-loadout-box:hover {
        border-color: rgba(232, 196, 84, 0.7);
        transform: translateY(-2px);
        background: linear-gradient(180deg, rgba(40,36,24,0.95), rgba(16,14,10,0.96));
      }
      .cs-loadout-box.is-selected {
        border-color: #e8c454;
        box-shadow: 0 0 0 1px rgba(232,196,84,0.4), 0 16px 40px rgba(0,0,0,0.35);
        transform: scale(1.02);
      }
      .cs-loadout-box:focus-visible {
        outline: 2px solid #e8c454;
        outline-offset: 3px;
      }
      .cs-loadout-guns {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 72px;
        margin-bottom: 14px;
      }
      .cs-loadout-icon {
        width: 140px;
        height: 56px;
        object-fit: contain;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
      }
      .cs-loadout-icon.is-side {
        width: 72px;
        height: 40px;
        opacity: 0.9;
      }
      .cs-loadout-plus {
        font-size: 22px;
        font-weight: 700;
        color: rgba(255,255,255,0.45);
      }
      .cs-loadout-name {
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .cs-loadout-hint {
        margin-top: 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.45);
      }

      .cs-lockdown {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%);
        transition: opacity 180ms ease;
        z-index: 8;
      }
      .cs-lockdown.is-on { opacity: 1; }
      .cs-lockdown-num {
        font-size: clamp(72px, 16vw, 120px);
        font-weight: 800;
        line-height: 1;
        color: #fff;
        text-shadow: 0 4px 0 #000, 0 0 40px rgba(196, 58, 58, 0.55);
        letter-spacing: 0.04em;
      }
      .cs-lockdown-num.pop {
        animation: kos-lock-pop 320ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
      }
      .cs-lockdown-label {
        margin-top: 8px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.7);
      }
      @keyframes kos-lock-pop {
        from { transform: scale(1.35); opacity: 0.4; }
        to { transform: scale(1); opacity: 1; }
      }

      .cs-killfeed {
        position: absolute;
        top: calc(52px + env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 5px;
        z-index: 7;
        pointer-events: none;
        max-width: min(360px, 50vw);
      }
      .cs-feed-row {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 5px 10px 5px 11px;
        background: rgba(8, 10, 16, 0.78);
        border: 1px solid rgba(30, 107, 255, 0.35);
        border-right: 3px solid rgba(196, 58, 58, 0.9);
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        opacity: 0;
        transform: translateX(12px);
        transition: opacity 180ms ease, transform 180ms ease;
        white-space: nowrap;
        text-shadow: 0 1px 0 #000;
        backdrop-filter: blur(4px);
      }
      .cs-feed-row.is-in { opacity: 1; transform: translateX(0); }
      .cs-feed-row.is-out { opacity: 0; transform: translateX(8px); }
      .cs-feed-killer { color: #f2f2f2; }
      .cs-feed-victim { color: #e8c56a; }
      .cs-feed-assist {
        color: rgba(255,255,255,0.55);
        font-weight: 600;
        font-size: 11px;
      }
      .cs-feed-gun {
        height: 14px;
        width: auto;
        max-width: 42px;
        object-fit: contain;
        filter: brightness(0) invert(1);
        opacity: 0.95;
      }
      .cs-feed-gun-fallback {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        text-transform: uppercase;
      }
      .cs-feed-hs {
        display: inline-flex;
        color: #fff;
        margin: 0 -1px;
      }

      .cs-scoreboard {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px 16px;
        background: rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(3px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 140ms ease, visibility 140ms ease;
        z-index: 6;
      }
      .cs-scoreboard.is-on {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
      .cs-sb-panel {
        width: min(560px, 94vw);
        max-height: min(88vh, 720px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, rgba(12, 16, 28, 0.94), rgba(8, 10, 18, 0.96));
        border: 1px solid rgba(255,255,255,0.10);
        border-top: 2px solid rgba(30, 107, 255, 0.75);
        box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(30, 107, 255, 0.08);
        padding: 12px 14px 10px;
      }
      .cs-sb-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        flex-shrink: 0;
      }
      .cs-sb-title {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.55);
        text-shadow: none;
      }
      .cs-sb-hint {
        font-size: 10px;
        font-weight: 650;
        color: rgba(255,255,255,0.32);
        letter-spacing: 0.08em;
        text-shadow: none;
      }
      .cs-sb-rows {
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-height: 0;
      }
      .cs-sb-head,
      .cs-sb-row {
        display: grid;
        grid-template-columns: 28px 1fr 42px 42px 42px;
        gap: 4px;
        align-items: center;
        padding: 0 10px;
        height: clamp(22px, 3.2vh, 30px);
        flex-shrink: 1;
      }
      .cs-sb-head {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.1em;
        color: rgba(255,255,255,0.38);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        margin-bottom: 4px;
        flex-shrink: 0;
        height: 26px;
        text-shadow: none;
      }
      .cs-sb-row {
        background: rgba(255,255,255,0.035);
        border-left: 2px solid transparent;
      }
      .cs-sb-row:nth-child(odd) {
        background: rgba(255,255,255,0.055);
      }
      .cs-sb-row.is-you {
        background: linear-gradient(90deg, rgba(30, 107, 255, 0.28), rgba(30, 107, 255, 0.08));
        border-left-color: #1e6bff;
        box-shadow: inset 0 0 0 1px rgba(30, 107, 255, 0.2);
      }
      .cs-sb-col {
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        font-size: clamp(12px, 1.5vh, 15px);
        line-height: 1;
      }
      .cs-sb-col.rank {
        text-align: center;
        font-size: clamp(10px, 1.3vh, 12px);
        font-weight: 800;
        color: rgba(255,255,255,0.4);
      }
      .cs-sb-row.is-you .cs-sb-col.rank { color: #8eb6ff; }
      .cs-sb-row.team-t { border-left-color: rgba(224,164,74,0.65); }
      .cs-sb-row.team-ct { border-left-color: rgba(90,168,255,0.65); }
      .cs-sb-team {
        display: inline-block;
        min-width: 20px;
        margin-right: 7px;
        font-size: 9px;
        font-style: normal;
        font-weight: 800;
        letter-spacing: 0.1em;
        opacity: 0.85;
      }
      .cs-sb-row.team-t .cs-sb-team { color: #e0a44a; }
      .cs-sb-row.team-ct .cs-sb-team { color: #5aa8ff; }
      .cs-sb-col.name {
        text-align: left;
        font-size: clamp(12px, 1.45vh, 14px);
        font-weight: 650;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cs-sb-col.name em {
        font-style: normal;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: #c9a227;
        background: rgba(201, 162, 39, 0.16);
        border: 1px solid rgba(201, 162, 39, 0.35);
        padding: 2px 5px;
        flex-shrink: 0;
      }

      @media (max-height: 700px) {
        .cs-sb-panel { padding: 8px 10px 8px; }
        .cs-sb-head, .cs-sb-row { height: clamp(18px, 2.8vh, 24px); padding: 0 8px; }
        .cs-sb-col { font-size: clamp(11px, 1.4vh, 13px); }
      }
      @media (max-width: 520px) {
        .cs-sb-panel { width: min(96vw, 560px); }
        .cs-sb-head, .cs-sb-row { grid-template-columns: 22px 1fr 34px 34px 34px; }
      }

      #game-hud:not(.is-touch) [data-touch-only] { display: none !important; }
      /* Touch: scale the type down for real instead of transform-scaling a blurry copy */
      #game-hud.is-touch {
        --hud-num: 27px;
        --hud-sub: 15px;
        --hud-bar-w: 62px;
        --hud-icon: 18px;
        --hud-gun: 34px;
        --hud-inset: 12px;
        --hud-lift: 66px;
      }
      @media (pointer: coarse) and (orientation: portrait) {
        #game-hud.is-touch { --hud-lift: 84px; }
      }
      @media (pointer: coarse) and (max-height: 400px) {
        #game-hud.is-touch {
          --hud-num: 23px;
          --hud-sub: 13px;
          --hud-gun: 28px;
          --hud-lift: 54px;
        }
      }

      #game-hud.is-dead .cs-bottom-left,
      #game-hud.is-dead .cs-bottom-right,
      #game-hud.is-dead .cs-hitmarker {
        opacity: 0;
        transition: opacity 220ms ease;
      }

      .cs-death {
        position: absolute;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 360ms cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 40;
      }
      .cs-death.is-on { opacity: 1; }

      .cs-death-vignette {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 70% 55% at 50% 45%, rgba(12, 20, 40, 0.15) 0%, rgba(8, 10, 18, 0.72) 55%, rgba(0, 0, 0, 0.88) 100%),
          linear-gradient(180deg, rgba(10, 30, 80, 0.35) 0%, transparent 32%, transparent 68%, rgba(0, 0, 0, 0.65) 100%),
          linear-gradient(90deg, rgba(26, 95, 255, 0.08) 0%, transparent 40%, transparent 60%, rgba(201, 162, 39, 0.06) 100%);
      }
      .cs-death-scan {
        position: absolute; inset: 0; pointer-events: none; opacity: 0.35;
        background: repeating-linear-gradient(
          0deg,
          transparent 0 3px,
          rgba(255,255,255,0.015) 3px 4px
        );
        animation: kos-death-scan 8s linear infinite;
      }

      .cs-death-panel {
        position: relative;
        text-align: center;
        padding: 36px 48px 40px;
        min-width: min(340px, 88vw);
        background: linear-gradient(165deg, rgba(14, 18, 32, 0.82), rgba(8, 10, 18, 0.9));
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 3px solid #1a5fff;
        box-shadow:
          0 28px 80px rgba(0, 0, 0, 0.55),
          0 0 0 1px rgba(26, 95, 255, 0.12),
          inset 0 1px 0 rgba(255,255,255,0.06);
        clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
        animation: kos-death-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .cs-death-panel::before {
        content: "";
        position: absolute; top: 0; left: 12%; right: 18%; height: 2px;
        background: linear-gradient(90deg, transparent, #1a5fff 35%, #c9a227 75%, transparent);
        opacity: 0.85;
      }
      .cs-death-panel::after {
        content: "";
        position: absolute; right: 0; top: 18px; bottom: 0; width: 2px;
        background: linear-gradient(180deg, #c9a227, transparent 60%);
        opacity: 0.55;
      }

      .cs-death-brand {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.42em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.35);
        margin-bottom: 18px;
        text-shadow: none;
      }

      .cs-death-kicker {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.36em;
        text-transform: uppercase;
        color: #c9a227;
        margin-bottom: 10px;
        text-shadow: 0 0 18px rgba(201, 162, 39, 0.35);
      }

      .cs-death-title {
        font-size: clamp(28px, 5vw, 40px);
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #fff;
        line-height: 1.05;
        text-shadow: 0 2px 0 rgba(0,0,0,0.5), 0 0 40px rgba(26, 95, 255, 0.25);
      }

      .cs-death-line {
        width: 72px;
        height: 2px;
        margin: 18px auto 22px;
        background: linear-gradient(90deg, transparent, #1a5fff, #c9a227, transparent);
      }

      .cs-death-timer {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .cs-death-ring {
        --p: 1;
        width: 88px;
        height: 88px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at center, rgba(8,10,18,0.95) 58%, transparent 59%),
          conic-gradient(from -90deg, #1a5fff calc(var(--p) * 360deg), rgba(255,255,255,0.08) 0);
        box-shadow:
          0 0 0 1px rgba(26, 95, 255, 0.2),
          0 0 28px rgba(26, 95, 255, 0.22);
        transition: background 80ms linear;
      }
      .cs-death-countdown {
        font-size: 26px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        color: #fff;
        letter-spacing: -0.02em;
        text-shadow: 0 1px 0 #000;
        line-height: 1;
      }
      .cs-death-sub {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.45);
        text-shadow: none;
      }

      @keyframes kos-death-in {
        from {
          opacity: 0;
          transform: translateY(18px) scale(0.96);
          filter: blur(4px);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
          filter: blur(0);
        }
      }
      @keyframes kos-death-scan {
        from { background-position: 0 0; }
        to { background-position: 0 40px; }
      }

      /* ---- match status bar ---- */
      .cs-matchbar {
        position: absolute;
        top: max(10px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 10px;
        padding: 6px 14px;
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(10,14,20,0.72), rgba(10,14,20,0.5));
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .cs-matchbar.is-on { display: flex; }
      /* Team strip sits under the match bar so both stay legible */
      .cs-teambar {
        position: absolute;
        top: calc(max(10px, env(safe-area-inset-top)) + 42px);
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 10px;
        padding: 5px 12px;
        border-radius: 11px;
        background: linear-gradient(180deg, rgba(10,14,20,0.7), rgba(10,14,20,0.46));
        border: 1px solid rgba(255,255,255,0.09);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        font-weight: 800;
        white-space: nowrap;
      }
      .cs-teambar.is-on { display: flex; }
      .cs-teambar-side { display: flex; align-items: center; gap: 6px; opacity: 0.72; }
      .cs-teambar-side.is-you { opacity: 1; }
      .cs-teambar-tag { font-size: 11px; letter-spacing: 0.16em; }
      .cs-teambar-score { font-size: 18px; font-variant-numeric: tabular-nums; color: #fff; }
      .cs-teambar-side.is-t .cs-teambar-tag { color: #e0a44a; }
      .cs-teambar-side.is-ct .cs-teambar-tag { color: #5aa8ff; }
      .cs-teambar-vs { font-size: 10px; letter-spacing: 0.18em; opacity: 0.4; }
      .cs-teambar-soon {
        margin-left: 4px;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.62);
        background: rgba(255,255,255,0.06);
        border: 1px dashed rgba(255,255,255,0.2);
      }
      .cs-matchbar.is-close { border-color: rgba(255,170,60,0.5); }
      .cs-matchbar-score { display: flex; align-items: baseline; gap: 3px; }
      .cs-matchbar-you { font-size: 19px; color: #fff; }
      .cs-matchbar-slash { font-size: 13px; opacity: 0.45; }
      .cs-matchbar-goal { font-size: 13px; opacity: 0.7; }
      .cs-matchbar.no-goal .cs-matchbar-slash,
      .cs-matchbar.no-goal .cs-matchbar-goal { display: none; }
      .cs-matchbar-sep { width: 1px; height: 16px; background: rgba(255,255,255,0.16); }
      .cs-matchbar-clock { font-size: 15px; font-variant-numeric: tabular-nums; opacity: 0.9; }
      .cs-matchbar-clock.is-urgent { color: #ff8f5e; animation: kos-clock-pulse 1s ease-in-out infinite; }
      .cs-matchbar-lead {
        display: none;
        font-size: 12px;
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(255,120,90,0.2);
        color: #ffb9a4;
      }
      .cs-matchbar-lead.is-on { display: block; }
      @keyframes kos-clock-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

      /* ---- match results ---- */
      .cs-result {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: radial-gradient(120% 90% at 50% 0%, rgba(12,18,28,0.86), rgba(4,6,10,0.95));
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        pointer-events: auto;
        z-index: 60;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .cs-result.is-on { display: flex; }
      .cs-result-panel {
        width: min(560px, 100%);
        max-height: 100%;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 22px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(20,26,36,0.96), rgba(12,16,24,0.96));
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 24px 70px rgba(0,0,0,0.6);
        animation: kos-result-in 0.3s cubic-bezier(0.2,0.8,0.3,1) both;
      }
      @keyframes kos-result-in {
        from { opacity: 0; transform: translateY(14px) scale(0.98); }
        to { opacity: 1; transform: none; }
      }
      .cs-result-kicker {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.55;
      }
      .cs-result-title { font-size: 38px; font-weight: 800; line-height: 1; }
      .cs-result-title.is-win {
        background: linear-gradient(180deg, #ffe08a, #ffb038);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .cs-result-sub { font-size: 13px; opacity: 0.7; margin-top: -6px; }
      .cs-result-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
        gap: 8px;
      }
      .cs-result-stat {
        padding: 9px 6px;
        border-radius: 10px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.06);
        text-align: center;
      }
      .cs-result-stat-v { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .cs-result-stat-l { font-size: 10px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.06em; }
      .cs-result-board {
        border-radius: 12px;
        background: rgba(0,0,0,0.28);
        border: 1px solid rgba(255,255,255,0.06);
        overflow: hidden;
      }
      .cs-result-head, .cs-result-row {
        display: grid;
        grid-template-columns: 28px 1fr 40px 40px 40px;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        font-size: 13px;
      }
      .cs-result-head {
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        opacity: 0.45;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .cs-result-rows { max-height: 190px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .cs-result-row + .cs-result-row { border-top: 1px solid rgba(255,255,255,0.04); }
      .cs-result-row.is-you { background: rgba(90,160,255,0.14); font-weight: 700; }
      .cs-result-row.is-top .rank { color: #ffc55c; }
      .cs-result-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cs-result-career {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 14px;
        padding-top: 4px;
        border-top: 1px solid rgba(255,255,255,0.07);
      }
      .cs-result-career-title {
        width: 100%;
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        opacity: 0.45;
      }
      .cs-result-career-bit { display: flex; align-items: baseline; gap: 5px; font-size: 12px; }
      .cs-result-career-bit b { font-size: 15px; font-variant-numeric: tabular-nums; }
      .cs-result-career-bit span { opacity: 0.55; }
      .cs-result-actions { display: flex; gap: 10px; }
      .cs-result-btn {
        flex: 1;
        padding: 12px 16px;
        border-radius: 11px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.06);
        color: #fff;
        font-family: inherit;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.12s ease, background 0.15s ease;
      }
      .cs-result-btn:hover { background: rgba(255,255,255,0.12); }
      .cs-result-btn:active { transform: scale(0.98); }
      .cs-result-btn.is-primary {
        background: linear-gradient(180deg, #4d8dff, #2f6ae0);
        border-color: rgba(140,180,255,0.5);
      }
      .cs-result-btn.is-primary:hover { background: linear-gradient(180deg, #5f9bff, #3b78f0); }

      @media (max-width: 560px), (max-height: 460px) {
        .cs-result-panel { padding: 16px; gap: 11px; border-radius: 14px; }
        .cs-result-title { font-size: 28px; }
        .cs-result-stats { grid-template-columns: repeat(auto-fit, minmax(62px, 1fr)); gap: 6px; }
        .cs-result-stat { padding: 7px 4px; }
        .cs-result-stat-v { font-size: 16px; }
        .cs-result-rows { max-height: 132px; }
        .cs-matchbar { padding: 4px 11px; gap: 8px; }
        .cs-matchbar-you { font-size: 16px; }
        .cs-matchbar-clock { font-size: 13px; }
        .cs-teambar { padding: 3px 9px; gap: 7px; top: calc(max(10px, env(safe-area-inset-top)) + 34px); }
        .cs-teambar-score { font-size: 15px; }
        .cs-teambar-soon { display: none; }
      }
    `
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

    kicker.textContent = result.reason === 'timeLimit' ? 'Time up' : 'Score limit reached'
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

    if (weapon.key !== this.lastWeapon) {
      this.setWeaponIcon(weapon.key)
    }

    const reserve = this.reserveFor(player)
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
  }
}
