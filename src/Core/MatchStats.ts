/** Fixed pool — match picks a random subset for the bot count */
export const BOT_NAME_POOL = [
  'BOT Lorik',
  'BOT Bardh',
  'BOT Diar',
  'BOT Jon',
  'BOT Edion',
  'BOT Ylli',
  'BOT Diell',
  'BOT Diart',
  'BOT Albin',
  'BOT Lirak',
  'BOT Rron',
  'BOT Endrit',
  'BOT Blerim',
  'BOT Arber',
  'BOT Fisnik',
  'BOT Granit',
  'BOT Leart',
  'BOT Valon',
  'BOT Kreshnik',
  'BOT Dren',
] as const

export function pickBotNames(count: number): string[] {
  const pool = [...BOT_NAME_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const n = Math.max(0, Math.min(count, pool.length))
  return pool.slice(0, n)
}

export type ScoreRow = {
  name: string
  kills: number
  deaths: number
  assists: number
  isYou: boolean
  /** Only set in team deathmatch */
  team?: 'T' | 'CT'
}

/** 0 on either limit means "no limit on this axis". Both 0 is an endless match. */
export type MatchRules = {
  killLimit: number
  timeLimitSec: number
}

export type MatchLength = 'short' | 'standard' | 'long' | 'endless'

export const MATCH_LENGTHS: Record<MatchLength, { label: string; hint: string; rules: MatchRules }> = {
  short: { label: 'Quick', hint: '15 kills · 5 min', rules: { killLimit: 15, timeLimitSec: 300 } },
  standard: { label: 'Standard', hint: '30 kills · 10 min', rules: { killLimit: 30, timeLimitSec: 600 } },
  long: { label: 'Long', hint: '50 kills · 20 min', rules: { killLimit: 50, timeLimitSec: 1200 } },
  endless: { label: 'Endless', hint: 'No limit', rules: { killLimit: 0, timeLimitSec: 0 } },
}

export const DEFAULT_MATCH_LENGTH: MatchLength = 'standard'

export function rulesForLength(length: MatchLength | undefined): MatchRules {
  return MATCH_LENGTHS[length ?? DEFAULT_MATCH_LENGTH].rules
}

/** 'coop' puts every human on one side against the bots. */
export type TeamMode = 'ffa' | 'coop'

export type MatchEndReason = 'killLimit' | 'timeLimit' | 'roundLimit'

export type MatchResult = {
  reason: MatchEndReason
  /** Placed first on the final scoreboard */
  won: boolean
  placement: number
  totalPlayers: number
  rows: ScoreRow[]
  durationSec: number
  kills: number
  deaths: number
  assists: number
  headshots: number
  bestStreak: number
  accuracy: number
  /** Career totals after this match was recorded */
  career: CareerTotals
}

export class MatchStats {
  public kills = 0
  public deaths = 0
  public assists = 0
  public headshots = 0
  public shotsFired = 0
  public shotsHit = 0
  public currentStreak = 0
  public bestStreak = 0

  public reset(): void {
    this.kills = 0
    this.deaths = 0
    this.assists = 0
    this.headshots = 0
    this.shotsFired = 0
    this.shotsHit = 0
    this.currentStreak = 0
    this.bestStreak = 0
  }

  public recordKill(headshot: boolean): void {
    this.kills++
    if (headshot) this.headshots++
    this.currentStreak++
    if (this.currentStreak > this.bestStreak) this.bestStreak = this.currentStreak
  }

  public recordDeath(): void {
    this.deaths++
    this.currentStreak = 0
  }

  /** Fraction 0..1; melee and unfired matches report 0 rather than NaN */
  public accuracy(): number {
    if (this.shotsFired <= 0) return 0
    return Math.min(1, this.shotsHit / this.shotsFired)
  }
}

export type CareerTotals = {
  matches: number
  wins: number
  kills: number
  deaths: number
  assists: number
  headshots: number
  shotsFired: number
  shotsHit: number
  bestStreak: number
  bestKills: number
  secondsPlayed: number
}

const CAREER_KEY = 'kos-career-v1'

function emptyCareer(): CareerTotals {
  return {
    matches: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    shotsFired: 0,
    shotsHit: 0,
    bestStreak: 0,
    bestKills: 0,
    secondsPlayed: 0,
  }
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Lifetime totals kept in localStorage so a session isn't thrown away on refresh.
 * Deliberately has no backend — it only needs to survive a reload.
 */
export class CareerStats {
  public static load(): CareerTotals {
    try {
      const raw = localStorage.getItem(CAREER_KEY)
      if (!raw) return emptyCareer()
      const parsed = JSON.parse(raw) as Partial<CareerTotals>
      const base = emptyCareer()
      for (const key of Object.keys(base) as Array<keyof CareerTotals>) {
        base[key] = num(parsed?.[key])
      }
      return base
    } catch {
      return emptyCareer()
    }
  }

  public static save(totals: CareerTotals): void {
    try {
      localStorage.setItem(CAREER_KEY, JSON.stringify(totals))
    } catch {
      /* private mode / quota — career is a nice-to-have, never block the match */
    }
  }

  public static clear(): void {
    try {
      localStorage.removeItem(CAREER_KEY)
    } catch {
      /* ignore */
    }
  }

  public static record(stats: MatchStats, won: boolean, durationSec: number): CareerTotals {
    const totals = CareerStats.load()
    totals.matches++
    if (won) totals.wins++
    totals.kills += stats.kills
    totals.deaths += stats.deaths
    totals.assists += stats.assists
    totals.headshots += stats.headshots
    totals.shotsFired += stats.shotsFired
    totals.shotsHit += stats.shotsHit
    totals.bestStreak = Math.max(totals.bestStreak, stats.bestStreak)
    totals.bestKills = Math.max(totals.bestKills, stats.kills)
    totals.secondsPlayed += Math.max(0, Math.round(durationSec))
    CareerStats.save(totals)
    return totals
  }
}

export function ratio(kills: number, deaths: number): number {
  if (deaths <= 0) return kills
  return kills / deaths
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function formatPlaytime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** FFA / TDM scoreboard order: kills, then assists, then fewer deaths. */
export function sortScoreRows(rows: ScoreRow[], playerTeam?: 'T' | 'CT'): ScoreRow[] {
  const next = [...rows]
  next.sort((a, b) => b.kills - a.kills || b.assists - a.assists || a.deaths - b.deaths)
  if (playerTeam) {
    next.sort((a, b) => Number(b.team === playerTeam) - Number(a.team === playerTeam))
  }
  return next
}

export function leadingKillsFrom(rows: ScoreRow[]): number {
  let best = 0
  for (const r of rows) best = Math.max(best, r.kills)
  return best
}

export function matchShouldEnd(
  rules: MatchRules,
  leadingKills: number,
  matchElapsed: number
): MatchEndReason | null {
  if (rules.killLimit > 0 && leadingKills >= rules.killLimit) return 'killLimit'
  if (rules.timeLimitSec > 0 && matchElapsed >= rules.timeLimitSec) return 'timeLimit'
  return null
}
