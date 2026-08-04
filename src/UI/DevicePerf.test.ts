import { describe, expect, it } from 'vitest'
import { probeDevicePerf } from './DevicePerf'

describe('probeDevicePerf', () => {
  it('suggests quality on desktop', () => {
    expect(probeDevicePerf(false).suggested).toBe('quality')
  })

  it('suggests a mobile profile on touch', () => {
    const p = probeDevicePerf(true)
    expect(['smooth', 'balanced', 'quality']).toContain(p.suggested)
  })
})
