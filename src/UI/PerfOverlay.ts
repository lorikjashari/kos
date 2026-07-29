/**
 * Lightweight FPS / net_graph style overlay driven by console cvars.
 * Measures real frame rate with its own requestAnimationFrame loop so it
 * works regardless of the game loop.
 */
export class PerfOverlay {
  private el: HTMLDivElement
  private raf = 0
  private frames = 0
  private last = performance.now()
  private fps = 0
  private frameMs = 0
  private showFps = false
  private netGraph = 0
  private pos = 1
  private width = 192

  constructor() {
    this.el = document.createElement('div')
    this.el.id = 'kos-perf'
    const style = document.createElement('style')
    style.textContent = `
      #kos-perf {
        display: none;
        position: fixed;
        left: 8px;
        top: 8px;
        z-index: 10040;
        padding: 4px 8px;
        background: rgba(0,0,0,0.55);
        color: #7CFC00;
        font-family: "Lucida Console", Consolas, monospace;
        font-size: 12px;
        line-height: 1.35;
        white-space: pre;
        pointer-events: none;
        border: 1px solid rgba(120,255,120,0.25);
        text-shadow: 0 1px 1px #000;
      }
      #kos-perf.pos-bottom { top: auto; bottom: 8px; }
      #kos-perf.pos-center { top: 50%; bottom: auto; transform: translateY(-50%); }
    `
    document.head.appendChild(style)
    document.body.appendChild(this.el)
  }

  public setShowFps(on: boolean): void {
    this.showFps = on
    this.refresh()
  }

  public setNetGraph(level: number): void {
    this.netGraph = Math.max(0, Math.min(3, Math.floor(level)))
    this.refresh()
  }

  public setPos(pos: number): void {
    this.pos = pos
    // 0 = center, 1 = bottom-left, anything else = top-left (default)
    this.el.classList.toggle('pos-bottom', pos === 1)
    this.el.classList.toggle('pos-center', pos === 0)
  }

  public setWidth(w: number): void {
    this.width = Math.max(64, w)
    this.el.style.minWidth = `${Math.round(this.width * 0.9)}px`
  }

  private refresh(): void {
    const visible = this.showFps || this.netGraph > 0
    this.el.style.display = visible ? 'block' : 'none'
    if (visible && !this.raf) {
      this.last = performance.now()
      this.frames = 0
      this.loop()
    } else if (!visible && this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    this.frames++
    const now = performance.now()
    const dt = now - this.last
    if (dt >= 250) {
      this.fps = Math.round((this.frames * 1000) / dt)
      this.frameMs = dt / this.frames
      this.frames = 0
      this.last = now
      this.render()
    }
  }

  private render(): void {
    const lines: string[] = []
    if (this.netGraph > 0) {
      lines.push(`fps  ${this.fps}`)
      if (this.netGraph >= 2) lines.push(`ms   ${this.frameMs.toFixed(1)}`)
      if (this.netGraph >= 3) {
        lines.push(`in   ${this.width} bytes`)
        lines.push(`out  ${this.width} bytes`)
        lines.push(`loss 0`)
      }
    } else if (this.showFps) {
      lines.push(`fps: ${this.fps}`)
    }
    this.el.textContent = lines.join('\n')
  }
}
