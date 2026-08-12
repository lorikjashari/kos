/** CS 1.6 HUD sprite rects (640×480 reference, atlas 640hud7). */
export const CS_HUD_ATLAS = '/hud/cs-green-yellow/640hud7.png'
export const CS_HUD_ATLAS_SIZE = 256

export type SprRect = { x: number; y: number; w: number; h: number }

export const CS_HUD_RECTS = {
  cross: { x: 80, y: 24, w: 32, h: 32 },
  suit: { x: 0, y: 24, w: 40, h: 40 },
  divider: { x: 240, y: 0, w: 2, h: 40 },
  number(d: number): SprRect {
    return { x: d * 24, y: 0, w: 20, h: 24 }
  },
} as const

export const CS_HUD_FONT_H = 24
export const CS_HUD_DIGIT_W = 20
