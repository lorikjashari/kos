import { describe, expect, it } from 'vitest'
import {
  assignBalancedBotTeams,
  scrambleBotTeams,
  teamCounts,
  teamsAreBalanced,
} from './TeamBalance'

describe('assignBalancedBotTeams', () => {
  it('keeps sides within one of each other including the player', () => {
    const bots = assignBalancedBotTeams(9, 'CT')
    const c = teamCounts('CT', bots)
    expect(c.T + c.CT).toBe(10)
    expect(teamsAreBalanced(c)).toBe(true)
  })
})

describe('scrambleBotTeams', () => {
  it('preserves bot count and stays roughly even', () => {
    const bots = scrambleBotTeams(7, 'T')
    expect(bots).toHaveLength(7)
    expect(teamsAreBalanced(teamCounts('T', bots), 2)).toBe(true)
  })
})
