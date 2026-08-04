import {
  DEMO_TICK_HZ,
  DEMO_VERSION,
  type DemoFile,
  type DemoHeader,
  type DemoTick,
} from './DemoFormat'

export type DemoSampleInput = Omit<DemoTick, 't'>

/**
 * Accumulates POV ticks at a fixed rate. Pure of Game — call `push` from the loop.
 */
export class DemoRecorder {
  private header: Omit<DemoHeader, 'duration'> | null = null
  private ticks: DemoTick[] = []
  private elapsed = 0
  private acc = 0
  private recording = false

  public get isRecording(): boolean {
    return this.recording
  }

  public get tickCount(): number {
    return this.ticks.length
  }

  public start(meta: {
    mapId: string
    teamMode: string
    playerName: string
    tickHz?: number
  }): void {
    this.header = {
      version: DEMO_VERSION,
      mapId: meta.mapId,
      teamMode: meta.teamMode,
      tickHz: meta.tickHz ?? DEMO_TICK_HZ,
      recordedAt: new Date().toISOString(),
      playerName: meta.playerName.slice(0, 24),
    }
    this.ticks = []
    this.elapsed = 0
    this.acc = 0
    this.recording = true
  }

  /** Advance clock; samples when the tick interval elapses. */
  public update(dt: number, sample: DemoSampleInput): void {
    if (!this.recording || !this.header) return
    this.elapsed += dt
    this.acc += dt
    const interval = 1 / this.header.tickHz
    if (this.ticks.length === 0 || this.acc >= interval) {
      this.acc = 0
      this.ticks.push({
        t: Math.round(this.elapsed * 1000) / 1000,
        x: sample.x,
        y: sample.y,
        z: sample.z,
        yaw: sample.yaw,
        pitch: sample.pitch,
        hp: sample.hp,
      })
    }
  }

  public stop(): DemoFile | null {
    if (!this.recording || !this.header) return null
    this.recording = false
    const duration = this.ticks.length ? this.ticks[this.ticks.length - 1].t : 0
    return {
      header: { ...this.header, duration },
      ticks: this.ticks,
    }
  }

  public cancel(): void {
    this.recording = false
    this.header = null
    this.ticks = []
    this.elapsed = 0
    this.acc = 0
  }
}
