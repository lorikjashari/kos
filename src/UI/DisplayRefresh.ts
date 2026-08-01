let cachedHz = 0
let probing: Promise<number> | null = null

export function getCachedRefreshRate(): number {
  return cachedHz
}

export function supportsHighRefresh(): boolean {
  return cachedHz >= 90
}

export function probeRefreshRate(samples = 45): Promise<number> {
  if (cachedHz >= 30) return Promise.resolve(cachedHz)
  if (probing) return probing

  probing = new Promise((resolve) => {
    let settled = false
    const finish = (hz: number) => {
      if (settled) return
      settled = true
      cachedHz = Math.max(30, Math.min(240, Math.round(hz) || 60))
      probing = null
      resolve(cachedHz)
    }

    // iOS can throttle/pause rAF during boot — never block the menu forever
    const watchdog = window.setTimeout(() => finish(cachedHz || 60), 1600)

    let last = 0
    const intervals: number[] = []
    const tick = (t: number) => {
      if (settled) return
      if (last > 0) intervals.push(t - last)
      last = t
      if (intervals.length < samples) {
        requestAnimationFrame(tick)
        return
      }
      window.clearTimeout(watchdog)
      intervals.sort((a, b) => a - b)
      const slice = intervals.slice(Math.floor(intervals.length * 0.2), Math.ceil(intervals.length * 0.8))
      const avg = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length)
      finish(1000 / Math.max(1, avg))
    }
    requestAnimationFrame(tick)
  })

  return probing
}

export function preferFpsForDisplay(preferred: number, displayHz: number): number {
  if (preferred > 0) return preferred
  if (displayHz >= 110) return 120
  if (displayHz >= 90) return 90
  return 0
}
