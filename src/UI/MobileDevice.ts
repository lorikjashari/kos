export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''

  if (/Windows NT/i.test(ua) && !/Windows Phone/i.test(ua)) return false

  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true
  }

  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) {
    return true
  }

  return false
}

export function isTouchDevice(): boolean {
  return isMobileDevice()
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const media = window.matchMedia?.('(display-mode: standalone)').matches
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const twa = document.referrer?.startsWith('android-app://')
  return !!(media || ios || twa)
}

export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  )
}

export function prefersLandscapeHint(): boolean {
  return isMobileDevice() && !!window.matchMedia?.('(orientation: portrait)').matches
}
