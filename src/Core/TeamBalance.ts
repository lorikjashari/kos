import type { Team } from './Teams'
import { otherTeam } from './Teams'

/**
 * Fill bot team slots so sides stay even given the local player's side.
 * totalBots = desired bots; player already occupies playerTeam.
 */
export function assignBalancedBotTeams(totalBots: number, playerTeam: Team): Team[] {
  const n = Math.max(0, Math.floor(totalBots))
  const out: Team[] = []
  // Target equal side sizes including the player
  let t = playerTeam === 'T' ? 1 : 0
  let ct = playerTeam === 'CT' ? 1 : 0
  for (let i = 0; i < n; i++) {
    const next: Team = t <= ct ? 'T' : 'CT'
    out.push(next)
    if (next === 'T') t++
    else ct++
  }
  return out
}

/** Re-deal bot sides (player stays). Used between rounds. */
export function scrambleBotTeams(totalBots: number, playerTeam: Team): Team[] {
  const n = Math.max(0, Math.floor(totalBots))
  const enemy = otherTeam(playerTeam)
  // Keep player side filled first, then overflow to the other
  const targetPerSide = Math.ceil((n + 1) / 2)
  const playerSideBots = Math.max(0, targetPerSide - 1)
  const enemyBots = n - playerSideBots
  const out: Team[] = []
  for (let i = 0; i < playerSideBots; i++) out.push(playerTeam)
  for (let i = 0; i < enemyBots; i++) out.push(enemy)
  // Fisher-Yates so spawn order isn't always allies-first
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function teamCounts(
  playerTeam: Team,
  botTeams: ReadonlyArray<Team | null>
): Record<Team, number> {
  const c: Record<Team, number> = { T: 0, CT: 0 }
  c[playerTeam]++
  for (const t of botTeams) {
    if (t === 'T' || t === 'CT') c[t]++
  }
  return c
}

export function teamsAreBalanced(counts: Record<Team, number>, maxDiff = 1): boolean {
  return Math.abs(counts.T - counts.CT) <= maxDiff
}
