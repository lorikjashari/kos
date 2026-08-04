type ToastKind = 'error' | 'warn' | 'info'

let host: HTMLDivElement | null = null
let hideTimer = 0

function ensureHost(): HTMLDivElement {
  if (host) return host
  const style = document.createElement('style')
  style.id = 'kos-toast-styles'
  style.textContent = `
    #kos-toast-host {
      position: fixed;
      left: 50%;
      bottom: max(24px, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 12000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: min(92vw, 420px);
    }
    .kos-toast {
      padding: 12px 16px;
      border-radius: 12px;
      font: 650 13px Outfit, Segoe UI, sans-serif;
      color: #fff;
      background: rgba(12, 16, 24, 0.92);
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 10px 28px rgba(0,0,0,0.35);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 160ms ease, transform 160ms ease;
    }
    .kos-toast.is-on { opacity: 1; transform: translateY(0); }
    .kos-toast.is-error { border-color: rgba(255,100,90,0.55); }
    .kos-toast.is-warn { border-color: rgba(255,180,70,0.5); }
  `
  if (!document.getElementById('kos-toast-styles')) document.head.appendChild(style)
  host = document.createElement('div')
  host.id = 'kos-toast-host'
  document.body.appendChild(host)
  return host
}

/** Non-blocking status / error toast (replaces window.alert for soft failures). */
export function showToast(message: string, kind: ToastKind = 'info', ms = 4200): void {
  const root = ensureHost()
  const el = document.createElement('div')
  el.className = `kos-toast is-${kind}`
  el.textContent = message
  root.appendChild(el)
  requestAnimationFrame(() => el.classList.add('is-on'))
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    el.classList.remove('is-on')
    window.setTimeout(() => el.remove(), 200)
  }, ms)
}

/** Privacy-light: log + toast. No network. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (ev) => {
    const msg = ev.message || 'Unexpected error'
    console.error('[kos]', msg, ev.error)
    showToast(msg.slice(0, 160), 'error')
    recordTelemetry('error', { message: msg.slice(0, 200) })
  })
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection'
    console.error('[kos]', msg, reason)
    showToast(msg.slice(0, 160), 'error')
    recordTelemetry('rejection', { message: msg.slice(0, 200) })
  })
}

type TelemetryEvent = { t: string; at: number; data?: Record<string, string> }

const TELEMETRY_KEY = 'kos-telemetry-ring-v1'
const TELEMETRY_MAX = 40

/** Local-only ring buffer — never sent anywhere unless you wire it later. */
export function recordTelemetry(t: string, data?: Record<string, string>): void {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY)
    const list: TelemetryEvent[] = raw ? (JSON.parse(raw) as TelemetryEvent[]) : []
    list.push({ t, at: Date.now(), data })
    while (list.length > TELEMETRY_MAX) list.shift()
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(list))
  } catch {
    /* private mode / quota */
  }
}

export function readTelemetryRing(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY)
    return raw ? (JSON.parse(raw) as TelemetryEvent[]) : []
  } catch {
    return []
  }
}
