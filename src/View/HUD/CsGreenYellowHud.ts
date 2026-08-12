import { CS_HUD_ATLAS, CS_HUD_RECTS, type SprRect } from './CsHudAtlas'

const HUD_BASE = '/hud/cs-green-yellow'

/** CS 1.6 green/yellow HUD — sprite digits and icons scaled from 640×480 layout. */
export class CsGreenYellowHud {
  private ready = false
  private loading: Promise<void> | null = null
  private atlasUrl = CS_HUD_ATLAS

  public ensureLoaded(): Promise<void> {
    if (this.ready) return Promise.resolve()
    if (this.loading) return this.loading
    this.loading = this.loadManifest().finally(() => {
      this.ready = true
      this.loading = null
    })
    return this.loading
  }

  private async loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${HUD_BASE}/manifest.json`)
      if (!res.ok) return
      const manifest = (await res.json()) as Record<string, string>
      this.atlasUrl = manifest['640hud7'] ?? CS_HUD_ATLAS
    } catch {
      /* baked PNGs may still exist without manifest */
    }
  }

  public apply(root: HTMLElement): void {
    root.classList.add('hud-cs-green')
    this.ensureLayers(root)
    this.styleAtlas(root)
  }

  public remove(root: HTMLElement): void {
    root.classList.remove('hud-cs-green')
    root.querySelector('.cs-hud-sprites')?.remove()
  }

  public update(
    root: HTMLElement,
    stats: { health: number; armor: number; mag: number; reserve: number; melee: boolean }
  ): void {
    if (!root.classList.contains('hud-cs-green')) return
    const wrap = root.querySelector('.cs-hud-sprites') as HTMLElement | null
    if (!wrap) return

    this.paintDigits(wrap.querySelector('.cs-hp-digits') as HTMLElement, stats.health, 3, stats.health <= 15)
    this.paintDigits(wrap.querySelector('.cs-armor-digits') as HTMLElement, stats.armor, 3, false)

    const armorRow = wrap.querySelector('.cs-hud-armor') as HTMLElement | null
    if (armorRow) armorRow.classList.toggle('is-on', stats.armor > 0)

    if (stats.melee) {
      this.paintDigits(wrap.querySelector('.cs-ammo-mag-digits') as HTMLElement, 0, 1, false, true)
      this.paintDigits(wrap.querySelector('.cs-ammo-res-digits') as HTMLElement, 0, 1, false, true)
      wrap.querySelector('.cs-spr-divider')?.classList.add('is-hidden')
    } else {
      wrap.querySelector('.cs-spr-divider')?.classList.remove('is-hidden')
      this.paintDigits(wrap.querySelector('.cs-ammo-mag-digits') as HTMLElement, stats.mag, 3, stats.mag <= 5)
      this.paintDigits(wrap.querySelector('.cs-ammo-res-digits') as HTMLElement, stats.reserve, 3, stats.reserve <= 0)
    }
  }

  private ensureLayers(root: HTMLElement): void {
    if (root.querySelector('.cs-hud-sprites')) return

    const wrap = document.createElement('div')
    wrap.className = 'cs-hud-sprites'
    wrap.innerHTML = `
      <div class="cs-hud-health">
        <div class="cs-spr-icon cs-spr-cross"></div>
        <div class="cs-spr-digits cs-hp-digits"></div>
        <div class="cs-spr-hp-bar"></div>
      </div>
      <div class="cs-hud-armor">
        <div class="cs-spr-icon cs-spr-suit"></div>
        <div class="cs-spr-digits cs-armor-digits"></div>
      </div>
      <div class="cs-hud-ammo">
        <div class="cs-spr-digits cs-ammo-mag-digits"></div>
        <div class="cs-spr-divider"></div>
        <div class="cs-spr-digits cs-ammo-res-digits"></div>
      </div>
    `
    root.appendChild(wrap)
  }

  private styleAtlas(root: HTMLElement): void {
    const url = this.atlasUrl
    root.querySelectorAll<HTMLElement>('.cs-spr-icon, .cs-spr-digit, .cs-spr-divider, .cs-spr-hp-bar').forEach((el) => {
      if (el.classList.contains('cs-spr-hp-bar')) return
      el.style.backgroundImage = `url("${url}")`
    })
    const bar = root.querySelector('.cs-spr-hp-bar') as HTMLElement | null
    if (bar) {
      bar.style.background = '#ffa000'
    }
    this.styleIcon(root.querySelector('.cs-spr-cross') as HTMLElement, CS_HUD_RECTS.cross)
    this.styleIcon(root.querySelector('.cs-spr-suit') as HTMLElement, CS_HUD_RECTS.suit)
    this.styleDivider(root.querySelector('.cs-spr-divider') as HTMLElement)
  }

  private styleIcon(el: HTMLElement | null, rect: SprRect): void {
    if (!el) return
    el.style.setProperty('--spr-x', String(rect.x))
    el.style.setProperty('--spr-y', String(rect.y))
    el.style.setProperty('--spr-w', String(rect.w))
    el.style.setProperty('--spr-h', String(rect.h))
  }

  private styleDivider(el: HTMLElement | null): void {
    if (!el) return
    const r = CS_HUD_RECTS.divider
    el.style.setProperty('--spr-x', String(r.x))
    el.style.setProperty('--spr-y', String(r.y))
  }

  private paintDigits(
    container: HTMLElement | null,
    value: number,
    minDigits: number,
    low: boolean,
    blank = false
  ): void {
    if (!container) return
    container.classList.toggle('is-low', low)
    if (blank) {
      container.replaceChildren()
      container.dataset.value = ''
      return
    }

    const text = String(Math.max(0, Math.round(value))).padStart(minDigits, '0')
    if (container.dataset.value === text) return
    container.dataset.value = text
    container.replaceChildren()

    for (const ch of text) {
      const d = Number(ch)
      const rect = CS_HUD_RECTS.number(d)
      const span = document.createElement('span')
      span.className = 'cs-spr-digit'
      span.style.backgroundImage = `url("${this.atlasUrl}")`
      span.style.setProperty('--spr-x', String(rect.x))
      span.style.setProperty('--spr-y', String(rect.y))
      container.appendChild(span)
    }
  }
}
