import { sampleDemoAt, type DemoFile, type DemoTick } from './DemoFormat'

/** Plays a DemoFile by advancing time and returning interpolated poses. */
export class DemoPlayer {
  private demo: DemoFile | null = null
  private time = 0
  private playing = false

  public get isPlaying(): boolean {
    return this.playing
  }

  public get currentTime(): number {
    return this.time
  }

  public get duration(): number {
    return this.demo?.header.duration ?? 0
  }

  public load(demo: DemoFile): void {
    this.demo = demo
    this.time = 0
    this.playing = false
  }

  public play(): boolean {
    if (!this.demo?.ticks.length) return false
    this.playing = true
    this.time = 0
    return true
  }

  public stop(): void {
    this.playing = false
    this.demo = null
    this.time = 0
  }

  /** Returns pose for this frame, or null when finished / idle. */
  public update(dt: number): DemoTick | null {
    if (!this.playing || !this.demo) return null
    this.time += dt
    const pose = sampleDemoAt(this.demo, this.time)
    if (this.time >= this.demo.header.duration) {
      this.playing = false
    }
    return pose
  }
}
