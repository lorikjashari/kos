import { Player } from '../../Core/Player'
import { WeaponIconRenderer } from './WeaponIconRenderer'
import { Game } from '../../Game'

type FeedPush = {
  killer: string
  victim: string
  weaponKey: string
  headshot: boolean
  assist?: string
  isLocal: boolean
}

export class GameHUD {
  private root: HTMLElement
  private ammoMagEl!: HTMLElement
  private ammoReserveEl!: HTMLElement
  private weaponIconEl!: HTMLImageElement
  private knifeIconEl!: HTMLImageElement
  private healthText!: HTMLElement
  private healthFill!: HTMLElement
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
  private killFeedEl!: HTMLElement
  private scoreboardEl!: HTMLElement
  private sbRowsEl!: HTMLElement
  private pauseMenuEl!: HTMLElement
  private pauseBtnEl!: HTMLElement
  private damageFlashUntil = 0
  private lastHealthShown = 100
  private deathShown = false
  private lastLockdownShown = -1
  private feedId = 0
  private readonly feedLifetimeMs = 4200
  private readonly maxFeed = 5

  constructor() {
    document.getElementById('game-hud')?.remove()
    this.ensureStyles()
    this.root = document.createElement('div')
    this.root.id = 'game-hud'
    this.root.innerHTML = `
      <div class="kos-brand">KoS</div>

      <div class="cs-pause-menu" id="hud-pause">
        <button type="button" class="cs-pause-btn" id="hud-pause-btn" title="Menu" aria-label="Open menu">
          <span></span><span></span>
        </button>
        <div class="cs-pause-panel" id="hud-pause-panel" aria-hidden="true">
          <button type="button" class="cs-pause-opt" data-pause="resume">Back to game</button>
          <button type="button" class="cs-pause-opt" data-pause="menu">Back to menu</button>
        </div>
      </div>

      <div class="cs-bottom-left">
        <div class="cs-vital">
          <div class="cs-vital-icon">+</div>
          <div class="cs-vital-main">
            <div class="cs-vital-num" id="hud-hp">100</div>
            <div class="cs-vital-bar"><div class="cs-vital-fill" id="hud-hp-fill"></div></div>
          </div>
        </div>
      </div>

      <div class="cs-bottom-right">
        <img id="hud-weapon-icon" class="cs-weapon-icon" alt="" />
        <div class="cs-ammo-row">
          <span class="cs-ammo-mag" id="hud-ammo">30</span>
          <span class="cs-ammo-sep">/</span>
          <span class="cs-ammo-reserve" id="hud-reserve">90</span>
        </div>
        <img id="hud-knife-icon" class="cs-knife-icon" alt="" />
      </div>

      <div class="cs-killfeed" id="hud-killfeed" aria-live="polite"></div>

      <div class="cs-scoreboard" id="hud-scoreboard" aria-hidden="true">
        <div class="cs-sb-panel">
          <div class="cs-sb-top">
            <div class="cs-sb-title">Scoreboard</div>
            <div class="cs-sb-hint">Hold Tab</div>
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
    document.body.appendChild(this.root)
    this.root.style.display = 'none'
    this.bind()
    requestAnimationFrame(() => this.bakeIcons())
  }

  /** Show HUD once a match starts from the main menu */
  public showGameplay(): void {
    this.root.style.display = ''
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
    this.killFeedEl = document.getElementById('hud-killfeed')!
    this.scoreboardEl = document.getElementById('hud-scoreboard')!
    this.sbRowsEl = document.getElementById('hud-sb-rows')!
    this.pauseMenuEl = document.getElementById('hud-pause')!
    this.pauseBtnEl = document.getElementById('hud-pause-btn')!

    this.pauseBtnEl.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const game = Game.getInstance()
      if (game.matchPaused) game.resumeMatch()
      else game.pauseMatch()
    })

    this.pauseMenuEl.querySelectorAll('[data-pause]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const action = (btn as HTMLElement).getAttribute('data-pause')
        const game = Game.getInstance()
        if (action === 'resume') game.resumeMatch()
        if (action === 'menu') game.returnToMenu()
      })
    })
  }

  public setPauseMenuOpen(open: boolean): void {
    if (!this.pauseMenuEl) return
    this.pauseMenuEl.classList.toggle('is-open', open)
    this.pauseBtnEl?.classList.toggle('is-active', open)
    const panel = document.getElementById('hud-pause-panel')
    panel?.setAttribute('aria-hidden', open ? 'false' : 'true')
  }

  public setScoreboardVisible(visible: boolean): void {
    if (!this.scoreboardEl) return
    this.scoreboardEl.classList.toggle('is-on', visible)
    this.scoreboardEl.setAttribute('aria-hidden', visible ? 'false' : 'true')
    if (visible) this.refreshScoreboard()
  }

  private refreshScoreboard(): void {
    if (!this.sbRowsEl) return
    const rows = Game.getInstance().getScoreboardRows()
    this.sbRowsEl.innerHTML = rows
      .map(
        (r, i) => `
      <div class="cs-sb-row ${r.isYou ? 'is-you' : ''}">
        <span class="cs-sb-col rank">${i + 1}</span>
        <span class="cs-sb-col name">${this.escapeHtml(r.name)}${r.isYou ? '<em>YOU</em>' : ''}</span>
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

  public showHitMarker(isHead = false): void {
    if (!this.hitmarkerEl) return
    this.hitmarkerEl.classList.toggle('is-head', isHead)
    this.hitmarkerEl.classList.add('is-on')
    this.hitmarkerTimer = performance.now() + 120
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
    const usp = this.iconRenderer.getIcon('Usp')
    const knife = this.iconRenderer.getIcon('Knife')
    if (ak) this.weaponIconEl.src = ak
    // Touch USP so first pistol equip never bakes mid-match
    void usp
    if (knife) this.knifeIconEl.src = knife
    this.iconsReady = true
  }

  /** Pre-bake every weapon silhouette before combat */
  public warmWeaponIcons(): void {
    this.bakeIcons()
  }

  private setWeaponIcon(weaponKey: string): void {
    const icon = this.iconRenderer.getIcon(weaponKey)
    if (icon) this.weaponIconEl.src = icon
  }

  private ensureStyles(): void {
    const existing = document.getElementById('game-hud-styles')
    if (existing) existing.remove()
    const style = document.createElement('style')
    style.id = 'game-hud-styles'
    style.textContent = `
      #game-hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 5;
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.35);
        user-select: none;
        -webkit-font-smoothing: antialiased;
      }

      .kos-brand {
        position: absolute;
        top: 12px;
        right: 16px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.28em;
        color: rgba(255,255,255,0.28);
        text-shadow: none;
      }

      .cs-pause-menu {
        position: absolute;
        top: 12px;
        left: 14px;
        z-index: 20;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      .cs-pause-btn {
        width: 36px;
        height: 36px;
        appearance: none;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.45);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 0;
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
        background: rgba(26, 95, 255, 0.35);
        border-color: rgba(26, 95, 255, 0.55);
        transform: translateY(-1px);
      }
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
        background: rgba(26, 95, 255, 0.18);
        color: #c9a227;
        transform: translateX(2px);
      }

      .cs-bottom-left {
        position: absolute;
        left: 16px;
        bottom: 16px;
      }
      .cs-vital {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cs-vital-icon {
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
        color: #fff;
        flex-shrink: 0;
      }
      .cs-vital-main {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 72px;
      }
      .cs-vital-num {
        font-size: 32px;
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
      }
      .cs-vital-bar {
        height: 3px;
        width: 78px;
        background: rgba(255,255,255,0.18);
        overflow: hidden;
      }
      .cs-vital-fill {
        height: 100%;
        width: 100%;
        transform-origin: left center;
        background: #fff;
        transition: transform 120ms linear;
      }
      .cs-vital-fill.is-low { background: #ff4d4d; }

      .cs-bottom-right {
        position: absolute;
        right: 16px;
        bottom: 16px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }
      .cs-weapon-icon {
        height: 44px;
        width: auto;
        max-width: 150px;
        object-fit: contain;
        object-position: right center;
        filter: brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.5));
      }
      .cs-ammo-row {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-variant-numeric: tabular-nums;
      }
      .cs-ammo-mag {
        font-size: 40px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
      }
      .cs-ammo-mag.is-low { color: #ff5555; text-shadow: 0 0 12px rgba(255,60,60,0.45); }
      .cs-ammo-sep {
        font-size: 20px;
        opacity: 0.55;
        margin: 0 3px;
        font-weight: 600;
      }
      .cs-ammo-reserve {
        font-size: 20px;
        font-weight: 700;
        opacity: 0.85;
      }
      .cs-knife-icon {
        height: 20px;
        width: auto;
        max-width: 44px;
        object-fit: contain;
        filter: brightness(0) saturate(100%) invert(72%) sepia(55%) saturate(500%) hue-rotate(5deg);
        opacity: 0.9;
        align-self: flex-end;
      }

      .cs-hitmarker {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 18px;
        height: 18px;
        margin: -9px 0 0 -9px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 40ms linear;
      }
      .cs-hitmarker.is-on { opacity: 1; }
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
        top: 52px;
        right: 16px;
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
        z-index: 12;
      }
      .cs-scoreboard.is-on {
        opacity: 1;
        visibility: visible;
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
        .cs-vital-num { font-size: 26px; }
        .cs-ammo-mag { font-size: 32px; }
        .cs-sb-panel { width: min(96vw, 560px); }
        .cs-sb-head, .cs-sb-row { grid-template-columns: 22px 1fr 34px 34px 34px; }
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
        z-index: 14;
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
    `
    document.head.appendChild(style)
  }

  private reserveFor(player: Player): number {
    if (player.currentWeapon.fireMode === 'melee') return 0
    return player.currentWeapon.magazineSize * 3
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

    this.healthText.textContent = String(Math.round(player.health))
    this.healthFill.style.transform = `scaleX(${Math.max(0, Math.min(1, player.health / 100))})`
    this.healthFill.classList.toggle('is-low', player.health <= 25)

    if (weapon.key !== this.lastWeapon) {
      this.setWeaponIcon(weapon.key)
    }

    if (player.ammoInMag !== this.lastAmmo || weapon.key !== this.lastWeapon) {
      this.ammoMagEl.textContent = isMelee ? '—' : String(player.ammoInMag)
      this.ammoReserveEl.textContent = isMelee ? '—' : String(this.reserveFor(player))
      this.ammoMagEl.classList.toggle('is-low', !isMelee && player.ammoInMag <= 5)
      this.lastAmmo = player.ammoInMag
      this.lastWeapon = weapon.key
    }
  }
}
