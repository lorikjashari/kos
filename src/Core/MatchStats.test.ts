import { beforeEach, describe, expect, it } from 'vitest'
import {
  CareerStats,
  MATCH_LENGTHS,
  MatchStats,
  formatClock,
  formatPlaytime,
  pickBotNames,
  ratio,
  rulesForLength,
} from './MatchStats'

function installMemoryStorage(): void {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
}

describe('MatchStats', () => {
  it('tracks a streak and remembers the best one across deaths', () => {
    const stats = new MatchStats()
    stats.recordKill(false)
    stats.recordKill(true)
    stats.recordKill(false)
    expect(stats.bestStreak).toBe(3)

    stats.recordDeath()
    expect(stats.currentStreak).toBe(0)

    stats.recordKill(false)
    expect(stats.bestStreak).toBe(3)
    expect(stats.kills).toBe(4)
    expect(stats.headshots).toBe(1)
  })

  it('reports zero accuracy rather than NaN before a shot is fired', () => {
    expect(new MatchStats().accuracy()).toBe(0)
  })

  it('never reports accuracy above 100%', () => {
    const stats = new MatchStats()
    stats.shotsFired = 2
    stats.shotsHit = 5
    expect(stats.accuracy()).toBe(1)
  })
})

describe('ratio', () => {
  it('treats a flawless match as its kill count instead of dividing by zero', () => {
    expect(ratio(7, 0)).toBe(7)
    expect(ratio(0, 0)).toBe(0)
  })

  it('divides normally once there is a death', () => {
    expect(ratio(6, 4)).toBeCloseTo(1.5)
  })
})

describe('match rules', () => {
  it('falls back to the default length when none is given', () => {
    expect(rulesForLength(undefined)).toEqual(MATCH_LENGTHS.standard.rules)
  })

  it('treats endless as no limit on either axis', () => {
    const rules = rulesForLength('endless')
    expect(rules.killLimit).toBe(0)
    expect(rules.timeLimitSec).toBe(0)
  })
})

describe('CareerStats', () => {
  beforeEach(() => {
    installMemoryStorage()
    CareerStats.clear()
  })

  it('starts empty', () => {
    expect(CareerStats.load().matches).toBe(0)
  })

  it('accumulates totals and keeps the best single match', () => {
    const first = new MatchStats()
    first.kills = 10
    first.deaths = 4
    first.bestStreak = 5

    const second = new MatchStats()
    second.kills = 3
    second.deaths = 6
    second.bestStreak = 2

    CareerStats.record(first, true, 300)
    const totals = CareerStats.record(second, false, 120)

    expect(totals.matches).toBe(2)
    expect(totals.wins).toBe(1)
    expect(totals.kills).toBe(13)
    expect(totals.deaths).toBe(10)
    expect(totals.secondsPlayed).toBe(420)
    // Bests must not be overwritten by a worse later match
    expect(totals.bestKills).toBe(10)
    expect(totals.bestStreak).toBe(5)
  })

  it('survives corrupt stored data instead of throwing', () => {
    localStorage.setItem('kos-career-v1', '{ not json')
    expect(CareerStats.load().matches).toBe(0)
  })

  it('discards negative or non-numeric fields from storage', () => {
    localStorage.setItem('kos-career-v1', JSON.stringify({ matches: -5, kills: 'lots', wins: 3 }))
    const totals = CareerStats.load()
    expect(totals.matches).toBe(0)
    expect(totals.kills).toBe(0)
    expect(totals.wins).toBe(3)
  })
})

describe('formatting', () => {
  it('pads clock seconds', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(600)).toBe('10:00')
    expect(formatClock(-5)).toBe('0:00')
  })

  it('scales playtime units', () => {
    expect(formatPlaytime(45)).toBe('45s')
    expect(formatPlaytime(600)).toBe('10m')
    expect(formatPlaytime(3900)).toBe('1h 5m')
  })
})

describe('pickBotNames', () => {
  it('returns the requested count with no duplicates', () => {
    const names = pickBotNames(6)
    expect(names).toHaveLength(6)
    expect(new Set(names).size).toBe(6)
  })

  it('clamps to the size of the pool', () => {
    expect(pickBotNames(999).length).toBeLessThanOrEqual(10)
    expect(pickBotNames(-3)).toHaveLength(0)
  })
})
