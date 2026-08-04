/** Whether a render frame should run under an fps_max-style cap. */
export function shouldRenderFrame(
  now: number,
  fpsCap: number,
  lastFrameTS: number
): { render: boolean; lastFrameTS: number } {
  // lastFrameTS < 0 means never drawn yet (see Game.startUpdateLoop).
  if (fpsCap <= 0 || lastFrameTS < 0) {
    return { render: true, lastFrameTS: now }
  }
  const minInterval = 1000 / fpsCap
  if (now - lastFrameTS < minInterval - 0.5) {
    return { render: false, lastFrameTS }
  }
  return { render: true, lastFrameTS: now }
}
