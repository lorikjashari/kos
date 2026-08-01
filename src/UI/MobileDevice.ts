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

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|Bytedance|Snapchat|MicroMessenger|GSA\//i.test(ua)
}

/** Lightweight rotate-to-landscape banner for phones in portrait. */
export function mountLandscapeHint(): void {
  if (!isMobileDevice()) return
  document.getElementById('kos-rotate-hint')?.remove()
  const el = document.createElement('div')
  el.id = 'kos-rotate-hint'
  el.innerHTML = `<div class="kos-rotate-card"><strong>Rotate your phone</strong><span>Landscape gives better aim and controls</span></div>`
  document.body.appendChild(el)
  if (!document.getElementById('kos-rotate-styles')) {
    const style = document.createElement('style')
    style.id = 'kos-rotate-styles'
    style.textContent = `
      #kos-rotate-hint {
        position: fixed; inset: 0; z-index: 70; display: none;
        align-items: center; justify-content: center;
        padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
          max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        background: rgba(4, 8, 16, 0.72);
        backdrop-filter: blur(8px);
        pointer-events: none;
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
      }
      #kos-rotate-hint.is-on { display: flex; }
      #kos-rotate-hint .kos-rotate-card {
        text-align: center;
        padding: 18px 22px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(8,14,24,0.88);
        box-shadow: 0 18px 40px rgba(0,0,0,0.4);
        color: #eef3ff;
      }
      #kos-rotate-hint strong {
        display: block; font-size: 1.05rem; letter-spacing: 0.04em;
        margin-bottom: 6px; color: #e8c56a;
      }
      #kos-rotate-hint span { font-size: 0.88rem; color: rgba(230,238,255,0.75); }
    `
    document.head.appendChild(style)
  }
  const sync = () => {
    el.classList.toggle('is-on', prefersLandscapeHint())
  }
  sync()
  window.addEventListener('orientationchange', sync)
  window.addEventListener('resize', sync)
}
