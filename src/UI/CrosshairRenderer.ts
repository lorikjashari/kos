import type { CrosshairSettings } from './SettingsStore'

/**
 * Draws a KoS crosshair into a canvas element.
 * Style 0 = default static, 2 = classic static (most used), 4 = classic dynamic (static here).
 */
export class CrosshairRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private settings: CrosshairSettings
  private logicalSize: number

  constructor(canvas: HTMLCanvasElement, settings: CrosshairSettings, logicalSize = 120) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.settings = settings
    this.logicalSize = logicalSize
    this.resize()
    this.draw()
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  public setSettings(settings: CrosshairSettings): void {
    this.settings = settings
    this.draw()
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = this.logicalSize
    // Resetting width/height clears the bitmap — always redraw after
    this.canvas.width = Math.round(size * dpr)
    this.canvas.height = Math.round(size * dpr)
    this.canvas.style.setProperty('width', `${size}px`, 'important')
    this.canvas.style.setProperty('height', `${size}px`, 'important')
    this.ctx = this.canvas.getContext('2d')!
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.draw()
  }

  public draw(): void {
    if (!this.ctx || this.ctx.canvas !== this.canvas) {
      this.ctx = this.canvas.getContext('2d')!
    }
    const ctx = this.ctx
    const w = this.logicalSize
    const h = this.logicalSize
    const cx = w / 2
    const cy = h / 2
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = false

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
        ctx.fillStyle = outline
        ctx.fillRect(x - o, y - o, bw + o * 2, bh + o * 2)
      }
      ctx.fillStyle = color
      ctx.fillRect(x, y, bw, bh)
    }

    if (!s.tStyle) {
      drawBar(cx - thick / 2, cy - halfGap - length, thick, length)
    }
    drawBar(cx - thick / 2, cy + halfGap, thick, length)
    drawBar(cx - halfGap - length, cy - thick / 2, length, thick)
    drawBar(cx + halfGap, cy - thick / 2, length, thick)

    if (s.centerDot) {
      const d = Math.max(1, s.dotSize) * unit * 0.45
      if (s.outline) {
        const o = s.outlineThickness
        ctx.fillStyle = outline
        ctx.fillRect(cx - d / 2 - o, cy - d / 2 - o, d + o * 2, d + o * 2)
      }
      ctx.fillStyle = color
      ctx.fillRect(cx - d / 2, cy - d / 2, d, d)
    }
  }
}
