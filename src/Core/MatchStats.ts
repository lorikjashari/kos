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
}

export class MatchStats {
  public kills = 0
  public deaths = 0
  public assists = 0

  public reset(): void {
    this.kills = 0
    this.deaths = 0
    this.assists = 0
  }
}
