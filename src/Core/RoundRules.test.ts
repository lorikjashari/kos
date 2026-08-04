import { describe, expect, it } from 'vitest'
import {
  countAliveByTeam,
  eliminationWinner,
  matchWinnerFromRounds,
  shouldScramble,
  timedRoundWinner,
} from './RoundRules'

describe('eliminationWinner', () => {
  it('awards the living side', () => {
    expect(eliminationWinner({ T: 0, CT: 2 })).toBe('CT')
    expect(eliminationWinner({ T: 1, CT: 0 })).toBe('T')
    expect(eliminationWinner({ T: 2, CT: 1 })).toBeNull()
    expect(eliminationWinner({ T: 0, CT: 0 })).toBe('draw')
  })
})

describe('countAliveByTeam', () => {
  it('includes the player and living bots', () => {
    expect(
      countAliveByTeam(true, 'CT', [
        { isAlive: true, team: 'T' },
        { isAlive: false, team: 'T' },
        { isAlive: true, team: 'CT' },
      ])
    ).toEqual({ T: 1, CT: 2 })
  })
})

describe('timedRoundWinner', () => {
  it('picks the side with more survivors', () => {
    expect(timedRoundWinner({ T: 3, CT: 1 })).toBe('T')
    expect(timedRoundWinner({ T: 2, CT: 2 })).toBe('draw')
  })
})

describe('matchWinnerFromRounds', () => {
  it('ends at roundsToWin', () => {
    expect(matchWinnerFromRounds({ T: 8, CT: 3 }, 8)).toBe('T')
    expect(matchWinnerFromRounds({ T: 7, CT: 7 }, 8)).toBeNull()
    expect(matchWinnerFromRounds({ T: 99, CT: 0 }, 0)).toBeNull()
  })
})

describe('shouldScramble', () => {
  it('fires on multiples', () => {
    expect(shouldScramble(3, 3)).toBe(true)
    expect(shouldScramble(2, 3)).toBe(false)
    expect(shouldScramble(3, 0)).toBe(false)
  })
})
