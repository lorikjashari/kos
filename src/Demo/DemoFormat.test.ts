import { describe, expect, it } from 'vitest'
import { DemoRecorder } from './DemoRecorder'
import { DemoPlayer } from './DemoPlayer'
import { parseDemoJson, sampleDemoAt, serializeDemo, type DemoFile } from './DemoFormat'

function makeDemo(): DemoFile {
  const rec = new DemoRecorder()
  rec.start({ mapId: 'pool_day', teamMode: 'ffa', playerName: 'Tester', tickHz: 10 })
  for (let i = 0; i < 5; i++) {
    rec.update(0.1, { x: i, y: 1, z: 0, yaw: i * 0.1, pitch: 0, hp: 100 - i })
  }
  const demo = rec.stop()
  if (!demo) throw new Error('expected demo')
  return demo
}

describe('DemoFormat', () => {
  it('round-trips JSON', () => {
    const demo = makeDemo()
    const again = parseDemoJson(serializeDemo(demo))
    expect(again?.ticks.length).toBe(demo.ticks.length)
    expect(again?.header.mapId).toBe('pool_day')
  })

  it('interpolates between ticks', () => {
    const demo = makeDemo()
    // ticks at t=0.1 (x=0), 0.2 (x=1), … → 0.15 is halfway
    const mid = sampleDemoAt(demo, 0.15)
    expect(mid).toBeTruthy()
    expect(mid!.x).toBeGreaterThan(0.4)
    expect(mid!.x).toBeLessThan(0.6)
  })
})

describe('DemoPlayer', () => {
  it('finishes after duration', () => {
    const demo = makeDemo()
    const player = new DemoPlayer()
    player.load(demo)
    expect(player.play()).toBe(true)
    let frames = 0
    while (player.isPlaying && frames < 100) {
      player.update(0.2)
      frames++
    }
    expect(player.isPlaying).toBe(false)
  })
})
