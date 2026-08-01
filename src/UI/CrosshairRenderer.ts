import type { CrosshairSettings } from './SettingsStore'

/**
 * Settings preview = canvas. In-game reticle = DOM (never a <canvas>,
 * so WebGL fullscreen canvas CSS cannot stretch it into a blue rectangle).
 */
export class CrosshairRenderer {
  private root: HTMLElement
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private settings: CrosshairSettings
  private logicalSize: number
  private arms: {
    t: HTMLElement
    b: HTMLElement
    l: HTMLElement
    r: HTMLElement
    dot: HTMLElement
  } | null = null

  constructor(target: HTMLElement, settings: CrosshairSettings, logicalSize = 120) {
    this.root = target
    this.settings = settings
    this.logicalSize = logicalSize

    if (target instanceof HTMLCanvasElement) {
      this.canvas = target
      this.ctx = target.getContext('2d')
    } else {
      this.mountDom(target)
    }
    this.resize()
    this.draw()
  }

  public getRoot(): HTMLElement {
    return this.root
  }

  public setSettings(settings: CrosshairSettings): void {
    this.settings = settings
    this.draw()
  }

  public resize(): void {
    if (this.canvas && this.ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const size = this.logicalSize
      this.canvas.width = Math.round(size * dpr)
      this.canvas.height = Math.round(size * dpr)
      this.canvas.style.width = `${size}px`
      this.canvas.style.height = `${size}px`
      this.ctx = this.canvas.getContext('2d')!
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.ctx.imageSmoothingEnabled = false
    } else {
      this.root.style.setProperty('width', `${this.logicalSize}px`, 'important')
      this.root.style.setProperty('height', `${this.logicalSize}px`, 'important')
    }
    this.draw()
  }

  public draw(): void {
    if (this.canvas && this.ctx) this.drawCanvas()
    else this.drawDom()
  }

  private mountDom(host: HTMLElement): void {
    host.innerHTML = `
      <i class="kos-xh-arm kos-xh-t" aria-hidden="true"></i>
      <i class="kos-xh-arm kos-xh-b" aria-hidden="true"></i>
      <i class="kos-xh-arm kos-xh-l" aria-hidden="true"></i>
      <i class="kos-xh-arm kos-xh-r" aria-hidden="true"></i>
      <i class="kos-xh-dot" aria-hidden="true"></i>
    `
    this.arms = {
      t: host.querySelector('.kos-xh-t') as HTMLElement,
      b: host.querySelector('.kos-xh-b') as HTMLElement,
      l: host.querySelector('.kos-xh-l') as HTMLElement,
      r: host.querySelector('.kos-xh-r') as HTMLElement,
      dot: host.querySelector('.kos-xh-dot') as HTMLElement,
    }
    if (!document.getElementById('kos-xh-styles')) {
      const style = document.createElement('style')
      style.id = 'kos-xh-styles'
      style.textContent = `
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
          z-index: 10000 !important;
          pointer-events: none !important;
          background: transparent !important;
          opacity: 0;
          visibility: hidden;
          display: none;
          overflow: visible;
        }
        #game-crosshair.is-on {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
        }
        #game-crosshair.is-awp-hidden {
          opacity: 0 !important;
          visibility: hidden !important;
          display: none !important;
        }
        #game-crosshair .kos-xh-arm,
        #game-crosshair .kos-xh-dot {
          position: absolute;
          box-sizing: border-box;
          pointer-events: none;
        }
      `
      document.head.appendChild(style)
    }
  }

  private drawDom(): void {
    if (!this.arms) return
    const s = this.settings
    const unit = this.logicalSize >= 100 ? 2.2 : 1.15
    const length = Math.max(0.5, s.size) * unit
    const thick = Math.max(0.5, s.thickness) * unit * 0.55
    const gap = s.gap * unit * 0.55
    const halfGap = gap / 2
    const color = `rgba(${s.colorR}, ${s.colorG}, ${s.colorB}, ${s.alpha})`
    const outline = s.outline
      ? `${s.outlineThickness}px solid rgba(0,0,0,${s.outlineOpacity})`
      : 'none'

    const cx = this.logicalSize / 2
    const cy = this.logicalSize / 2

    const place = (el: HTMLElement, x: number, y: number, w: number, h: number, on: boolean) => {
      el.style.display = on ? 'block' : 'none'
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.width = `${Math.max(0.5, w)}px`
      el.style.height = `${Math.max(0.5, h)}px`
      el.style.background = color
      el.style.boxShadow = outline !== 'none' ? `0 0 0 ${s.outlineThickness}px rgba(0,0,0,${s.outlineOpacity})` : 'none'
      el.style.border = 'none'
    }

    place(this.arms.t, cx - thick / 2, cy - halfGap - length, thick, length, !s.tStyle)
    place(this.arms.b, cx - thick / 2, cy + halfGap, thick, length, true)
    place(this.arms.l, cx - halfGap - length, cy - thick / 2, length, thick, true)
    place(this.arms.r, cx + halfGap, cy - thick / 2, length, thick, true)

    const d = Math.max(1, s.dotSize) * unit * 0.45
    place(this.arms.dot, cx - d / 2, cy - d / 2, d, d, !!s.centerDot)
  }

  private drawCanvas(): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    if (ctx.canvas !== canvas) this.ctx = canvas.getContext('2d')
    const c = this.ctx!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = this.logicalSize
    const h = this.logicalSize
    const cx = w / 2
    const cy = h / 2
    c.clearRect(0, 0, w, h)
    c.imageSmoothingEnabled = false

    const s = this.settings
    const color = `rgba(${s.colorR}, ${s.colorG}, ${s.colorB}, ${s.alpha})`
    const outline = `rgba(0, 0, 0, ${s.outlineOpacity})`
    const unit = this.logicalSize >= 100 ? 2.2 : 1.15
    const length = Math.max(0.5, s.size) * unit
    const thick = Math.max(0.5, s.thickness) * unit * 0.55
    const gap = s.gap * unit * 0.55
    const halfGap = gap / 2

    const drawBar = (x: number, y: number, bw: number, bh: number) => {
      if (s.outline) {
        const o = s.outlineThickness
        c.fillStyle = outline
        c.fillRect(x - o, y - o, bw + o * 2, bh + o * 2)
      }
      c.fillStyle = color
      c.fillRect(x, y, bw, bh)
    }

    if (!s.tStyle) drawBar(cx - thick / 2, cy - halfGap - length, thick, length)
    drawBar(cx - thick / 2, cy + halfGap, thick, length)
    drawBar(cx - halfGap - length, cy - thick / 2, length, thick)
    drawBar(cx + halfGap, cy - thick / 2, length, thick)

    if (s.centerDot) {
      const d = Math.max(1, s.dotSize) * unit * 0.45
      if (s.outline) {
        const o = s.outlineThickness
        c.fillStyle = outline
        c.fillRect(cx - d / 2 - o, cy - d / 2 - o, d + o * 2, d + o * 2)
      }
      c.fillStyle = color
      c.fillRect(cx - d / 2, cy - d / 2, d, d)
    }
  }
}
