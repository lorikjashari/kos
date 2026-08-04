import type { MobilePerfProfile } from './SettingsStore'

const AUTO_KEY = 'kos-perf-auto-v1'

export type DeviceProbe = {
  memoryGb: number | null
  cores: number | null
  touch: boolean
  suggested: MobilePerfProfile
  reason: string
}

/** Heuristic for phones that will struggle with Dust II + bots. */
export function probeDevicePerf(touch: boolean): DeviceProbe {
  // CI / Node vitest has no `navigator` — guard before any property access
  const nav =
    typeof globalThis !== 'undefined' && 'navigator' in globalThis
      ? (globalThis.navigator as Navigator & { deviceMemory?: number })
      : null
  const memoryGb = typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null
  const cores = typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null

  if (!touch) {
    return { memoryGb, cores, touch, suggested: 'quality', reason: 'desktop' }
  }

  // Very constrained devices → smooth
  if ((memoryGb !== null && memoryGb <= 2) || (cores !== null && cores <= 4)) {
    return { memoryGb, cores, touch, suggested: 'smooth', reason: 'low-memory-or-cores' }
  }
  // Mid phones → balanced (default)
  if ((memoryGb !== null && memoryGb <= 4) || (cores !== null && cores <= 6)) {
    return { memoryGb, cores, touch, suggested: 'balanced', reason: 'mid-phone' }
  }
  return { memoryGb, cores, touch, suggested: 'balanced', reason: 'default-mobile' }
}

export function hasAutoPerfApplied(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return true
  }
}

export function markAutoPerfApplied(): void {
  try {
    localStorage.setItem(AUTO_KEY, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Mobile perf presets (applied by Renderer.applyMobilePerfProfile):
 * - smooth: ~0.76 backbuffer, no post, no particles, shadows off on Dust II
 * - balanced: ~0.92 backbuffer, no post/particles, shadows on
 * - quality: ~1.12 backbuffer, post + particles + shadows
 */
export const PERF_PRESET_DOCS = {
  smooth: 'Lowest cost — prefer on older phones / Dust II.',
  balanced: 'Default — playable on most phones.',
  quality: 'Highest fidelity — newer phones only.',
} as const
