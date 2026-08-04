import { describe, expect, it } from 'vitest'
import {
  BOT_LOD_MID,
  BOT_LOD_NEAR,
  botAiSkipFrames,
  botLodFromDistSq,
  flatDistSq,
} from './BotPerf'

describe('botLodFromDistSq', () => {
  it('classifies near / mid / far', () => {
    expect(botLodFromDistSq(0)).toBe('near')
    expect(botLodFromDistSq(BOT_LOD_NEAR * BOT_LOD_NEAR)).toBe('near')
    expect(botLodFromDistSq((BOT_LOD_NEAR + 1) ** 2)).toBe('mid')
    expect(botLodFromDistSq(BOT_LOD_MID * BOT_LOD_MID)).toBe('mid')
    expect(botLodFromDistSq((BOT_LOD_MID + 1) ** 2)).toBe('far')
  })
})

describe('botAiSkipFrames', () => {
  it('never skips near bots', () => {
    expect(botAiSkipFrames('near', true)).toBe(0)
    expect(botAiSkipFrames('near', false)).toBe(0)
  })

  it('skips more on mobile far bots', () => {
    expect(botAiSkipFrames('far', true)).toBeGreaterThan(botAiSkipFrames('far', false))
    expect(botAiSkipFrames('mid', true)).toBeGreaterThanOrEqual(1)
  })
})

describe('flatDistSq', () => {
  it('matches hypotenuse squared', () => {
    expect(flatDistSq(0, 0, 3, 4)).toBe(25)
  })
})
