import type { MatchLength } from './MatchStats'
import type { Team } from './Teams'

/** Per-round TDM settings (bomb-less). FFA ignores this and keeps kill races. */
export type RoundConfig = {
  /** First side to this many round wins ends the match. 0 = endless rounds. */
  roundsToWin: number
  freezeSec: number
  /** Soft round clock; 0 = elimination only */
  roundTimeSec: number
  warmupSec: number
  resetLoadoutEachRound: boolean
  /** Scramble bot sides every N completed rounds (0 = never) */
  scrambleEveryRounds: number
}

export const ROUND_CONFIGS: Record<MatchLength, RoundConfig> = {
  short: {
    roundsToWin: 5,
    freezeSec: 3,
    roundTimeSec: 120,
    warmupSec: 5,
    resetLoadoutEachRound: true,
    scrambleEveryRounds: 0,
  },
  standard: {
    roundsToWin: 8,
    freezeSec: 3,
    roundTimeSec: 150,
    warmupSec: 6,
    resetLoadoutEachRound: true,
    scrambleEveryRounds: 3,
  },
  long: {
    roundsToWin: 13,
    freezeSec: 4,
    roundTimeSec: 180,
    warmupSec: 8,
    resetLoadoutEachRound: true,
    scrambleEveryRounds: 4,
  },
  endless: {
    roundsToWin: 0,
    freezeSec: 3,
    roundTimeSec: 0,
    warmupSec: 5,
    resetLoadoutEachRound: true,
    scrambleEveryRounds: 3,
  },
}

export function roundConfigForLength(length: MatchLength | undefined): RoundConfig {
  return ROUND_CONFIGS[length ?? 'standard']
}

export type AliveCounts = Record<Team, number>

export function countAliveByTeam(
  playerAlive: boolean,
  playerTeam: Team,
  bots: ReadonlyArray<{ isAlive: boolean; team: Team | null }>
): AliveCounts {
  const counts: AliveCounts = { T: 0, CT: 0 }
  if (playerAlive) counts[playerTeam]++
  for (const b of bots) {
    if (!b.isAlive || !b.team) continue
    counts[b.team]++
  }
  return counts
}

/** Winner when the other side is wiped; null if both still fighting; draw if both empty. */
export function eliminationWinner(counts: AliveCounts): Team | 'draw' | null {
  const t = counts.T
  const ct = counts.CT
  if (t <= 0 && ct <= 0) return 'draw'
  if (t <= 0 && ct > 0) return 'CT'
  if (ct <= 0 && t > 0) return 'T'
  return null
}

/** Round clock expiry — side with more alive wins; tie → draw. */
export function timedRoundWinner(counts: AliveCounts): Team | 'draw' {
  if (counts.T === counts.CT) return 'draw'
  return counts.T > counts.CT ? 'T' : 'CT'
}

export function matchWinnerFromRounds(
  wins: AliveCounts,
  roundsToWin: number
): Team | null {
  if (roundsToWin <= 0) return null
  if (wins.T >= roundsToWin) return 'T'
  if (wins.CT >= roundsToWin) return 'CT'
  return null
}

export function shouldScramble(roundNumber: number, every: number): boolean {
  if (every <= 0 || roundNumber <= 0) return false
  return roundNumber % every === 0
}
