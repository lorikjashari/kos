/**
 * Distance LOD for bot AI / render cost (XZ). Pure — unit-tested.
 *
 * near  — full think + full anim
 * mid   — full think every other tick; lighter anim
 * far   — think ~4 Hz; pose/sync only
 */

export type BotLod = 'near' | 'mid' | 'far'

export const BOT_LOD_NEAR = 28
export const BOT_LOD_MID = 55

export function botLodFromDistSq(distSq: number): BotLod {
  if (distSq <= BOT_LOD_NEAR * BOT_LOD_NEAR) return 'near'
  if (distSq <= BOT_LOD_MID * BOT_LOD_MID) return 'mid'
  return 'far'
}

export function flatDistSq(
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/** How many frames to skip full AI between thinks (0 = every frame). */
export function botAiSkipFrames(lod: BotLod, mobile: boolean): number {
  if (lod === 'near') return 0
  if (lod === 'mid') return mobile ? 1 : 0
  return mobile ? 3 : 2
}
