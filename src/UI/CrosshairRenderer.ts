import type { CrosshairSettings } from './SettingsStore'

/**
 * Draws a KoS crosshair into a canvas element.
 * Style 0 = default static, 2 = classic static (most used), 4 = classic dynamic (static here).
 */
export class CrosshairRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private settings: CrosshairSettings

  constructor(canvas: HTMLCanvasElement, settings: CrosshairSettings) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.settings = settings
    this.resize()
    this.draw()
  }

  public setSettings(settings: CrosshairSettings): void {
    this.settings = settings
    this.draw()
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = 120
    this.canvas.width = size * dpr
    this.canvas.height = size * dpr
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.draw()
  }

  public draw(): void {
    const ctx = this.ctx
    const w = 120
    const h = 120
    const cx = w / 2
    const cy = h / 2
    ctx.clearRect(0, 0, w, h)

    const s = this.settings
    const color = `rgba(${s.colorR}, ${s.colorG}, ${s.colorB}, ${s.alpha})`
    const outline = `rgba(0, 0, 0, ${s.outlineOpacity})`

    // CS gap/size are in "crosshair units" — scale for screen
    const unit = 2.2
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

    // Classic cross only (style UI removed — always draw bars)
    const drawCross = true
    const drawDot = s.centerDot

    if (drawCross) {
      // Top (skip if T-style)
      if (!s.tStyle) {
        drawBar(cx - thick / 2, cy - halfGap - length, thick, length)
      }
      // Bottom
      drawBar(cx - thick / 2, cy + halfGap, thick, length)
      // Left
      drawBar(cx - halfGap - length, cy - thick / 2, length, thick)
      // Right
      drawBar(cx + halfGap, cy - thick / 2, length, thick)
    }

    if (drawDot) {
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
