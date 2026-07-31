export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const noHover = window.matchMedia?.('(hover: none)').matches
  const touchPoints = (navigator.maxTouchPoints || 0) > 0
  const ua = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '')
  return !!(coarse || noHover || touchPoints || ua)
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const media = window.matchMedia?.('(display-mode: standalone)').matches
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const twa = document.referrer?.startsWith('android-app://')
  return !!(media || ios || twa)
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
}

export function prefersLandscapeHint(): boolean {
  return isTouchDevice() && window.matchMedia?.('(orientation: portrait)').matches
}
