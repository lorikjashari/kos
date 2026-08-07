/**
 * Distance LOD for bot AI / render cost (XZ). Pure — unit-tested.
 *
 * near  — full think when budget allows + full anim
 * mid   — think every few ticks; lighter anim
 * far   — think rarely; pose/sync mostly
 *
 * Live play was ~2× slower than playdemo because demo freezes AI + skips Ammo.
 * These defaults keep combat readable while capping raycast storms on Dust II.
 */

export type BotLod = 'near' | 'mid' | 'far'

/** Tighter than the old 28/55 — mid/far kick in sooner on open maps. */
export const BOT_LOD_NEAR = 18
export const BOT_LOD_MID = 40

/**
 * How many bots may run a full combatThink this frame.
 * Dust II trimeshes make each nav ray expensive — keep this low everywhere.
 */
export const BOT_FULL_THINKS_PER_FRAME = 3
/** Dust II: allow more full thinks so movement doesn't stair-step. */
export const BOT_FULL_THINKS_PER_FRAME_HEAVY = 4

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

/**
 * How many frames to skip full AI between thinks (0 = every frame).
 * `heavyMap` (Dust II) forces skips even for near bots so 5 bots can't
 * each fire 30+ Ammo rays every display frame.
 */
export function botAiSkipFrames(lod: BotLod, mobile: boolean, heavyMap = false): number {
  if (lod === 'near') {
    if (heavyMap) return mobile ? 2 : 1
    return mobile ? 1 : 0
  }
  if (lod === 'mid') {
    if (heavyMap) return mobile ? 4 : 3
    return mobile ? 2 : 1
  }
  if (heavyMap) return mobile ? 6 : 5
  return mobile ? 4 : 3
}
