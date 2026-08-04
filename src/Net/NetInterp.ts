/** Timestamped pose sample for remote pawn interpolation. */
export type PoseSample = {
  t: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

/** Default render delay (seconds) — one-ish packet behind at 20 Hz. */
export const DEFAULT_INTERP_DELAY = 0.1

/**
 * Ring of pose snapshots. Sample at (now - delay) so remotes don't teleport
 * to the latest packet every tick.
 */
export class NetPoseBuffer {
  private samples: PoseSample[] = []
  private readonly maxSamples: number

  constructor(maxSamples = 16) {
    this.maxSamples = maxSamples
  }

  public push(sample: PoseSample): void {
    const last = this.samples[this.samples.length - 1]
    if (last && sample.t < last.t) return
    this.samples.push(sample)
    if (this.samples.length > this.maxSamples) this.samples.shift()
  }

  public clear(): void {
    this.samples.length = 0
  }

  public ageSec(now = performance.now() / 1000): number {
    const last = this.samples[this.samples.length - 1]
    if (!last) return Number.POSITIVE_INFINITY
    return Math.max(0, now - last.t)
  }

  /** Interpolate (or clamp to newest) at renderTime (seconds, performance clock). */
  public sampleAt(renderTime: number): PoseSample | null {
    const s = this.samples
    if (s.length === 0) return null
    if (s.length === 1) return { ...s[0] }

    if (renderTime <= s[0].t) return { ...s[0] }
    const newest = s[s.length - 1]
    if (renderTime >= newest.t) return { ...newest }

    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i]
      const b = s[i + 1]
      if (renderTime < a.t || renderTime > b.t) continue
      const span = b.t - a.t
      const u = span <= 1e-6 ? 1 : (renderTime - a.t) / span
      return {
        t: renderTime,
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        z: a.z + (b.z - a.z) * u,
        yaw: lerpAngle(a.yaw, b.yaw, u),
        pitch: a.pitch + (b.pitch - a.pitch) * u,
      }
    }
    return { ...newest }
  }
}

export function lerpAngle(a: number, b: number, u: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * u
}

/** Clamp ex_interp-style delay into a sane band (seconds). */
export function clampInterpDelay(sec: number): number {
  if (!Number.isFinite(sec)) return DEFAULT_INTERP_DELAY
  return Math.max(0.03, Math.min(0.25, sec))
}
