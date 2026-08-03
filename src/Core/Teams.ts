export type Team = 'T' | 'CT'

export const TEAM_LABEL: Record<Team, string> = {
  T: 'Terrorists',
  CT: 'Counter-Terrorists',
}

export const TEAM_SHORT: Record<Team, string> = {
  T: 'T',
  CT: 'CT',
}

/** Hex used for teammate outlines and HUD accents */
export const TEAM_COLOR: Record<Team, number> = {
  T: 0xe0a44a,
  CT: 0x5aa8ff,
}

export const TEAM_CSS: Record<Team, string> = {
  T: '#e0a44a',
  CT: '#5aa8ff',
}

export function otherTeam(team: Team): Team {
  return team === 'T' ? 'CT' : 'T'
}

/** Team play runs 5v5 by default and scales with the lobby up to 10v10. */
export const MIN_TEAM_SIZE = 5
export const MAX_TEAM_SIZE = 10
export const DEFAULT_TEAM_SIZE = 5

export function clampTeamSize(size: number | undefined): number {
  const n = Math.round(size ?? DEFAULT_TEAM_SIZE)
  if (!Number.isFinite(n)) return DEFAULT_TEAM_SIZE
  return Math.max(MIN_TEAM_SIZE, Math.min(MAX_TEAM_SIZE, n))
}
