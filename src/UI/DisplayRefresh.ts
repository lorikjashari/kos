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
    let last = 0
    const intervals: number[] = []
    const tick = (t: number) => {
      if (last > 0) intervals.push(t - last)
      last = t
      if (intervals.length < samples) {
        requestAnimationFrame(tick)
        return
      }
      intervals.sort((a, b) => a - b)
      const slice = intervals.slice(Math.floor(intervals.length * 0.2), Math.ceil(intervals.length * 0.8))
      const avg = slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length)
      const hz = Math.round(1000 / Math.max(1, avg))
      cachedHz = Math.max(30, Math.min(240, hz))
      probing = null
      resolve(cachedHz)
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
