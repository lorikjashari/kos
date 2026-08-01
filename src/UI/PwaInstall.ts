import { isIos, isInAppBrowser, isMobileDevice, isStandalonePwa } from './MobileDevice'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export class PwaInstall {
  private root: HTMLElement | null = null
  private deferred: BeforeInstallPromptEvent | null = null
  private onUnlocked: (() => void) | null = null

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferred = e as BeforeInstallPromptEvent
      this.refreshUi()
    })
    window.addEventListener('appinstalled', () => {
      this.deferred = null
      this.refreshUi()
    })
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => this.refreshUi())
  }

  public async register(): Promise<void> {
    if (!('serviceWorker' in navigator)) return
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    } catch {
      /* ignore */
    }
  }

  public requiresInstall(): boolean {
    return isMobileDevice() && !isStandalonePwa()
  }

  public isReady(): boolean {
    return !this.requiresInstall()
  }

  public mount(onUnlocked?: () => void): void {
    this.onUnlocked = onUnlocked || null
    if (!this.requiresInstall()) {
      this.destroy()
      return
    }
    this.ensureStyles()
    document.getElementById('kos-pwa-gate')?.remove()
    this.root = document.createElement('div')
    this.root.id = 'kos-pwa-gate'
    this.root.innerHTML = this.buildHtml()
    document.body.appendChild(this.root)
    this.bind()
    this.refreshUi()
  }

  public destroy(): void {
    this.root?.remove()
    this.root = null
  }

  private buildHtml(): string {
    const ios = isIos()
    const inApp = isInAppBrowser()
    const shareIcon = `
      <svg class="kos-pwa-share" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M12 3l4 4h-3v6h-2V7H8l4-4zm-7 10v6h14v-6h2v8H3v-8h2z"/>
      </svg>`
    return `
      <div class="kos-pwa-card">
        <img class="kos-pwa-logo" src="/logo.png" alt="KoS" width="160" height="160" />
        <h1>Add to Home Screen</h1>
        <p class="kos-pwa-lead">On mobile, KoS only runs as an installed app. Add it to your home screen to unlock play and custom touch controls.</p>
        <div class="kos-pwa-steps" data-ios="${ios ? '1' : '0'}">
          ${
            ios
              ? `
            <ol>
              <li>In <strong>Safari</strong>, tap ${shareIcon} <strong>Share</strong> in the toolbar</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong>, then open the <strong>KoS</strong> icon</li>
            </ol>
            <p class="kos-pwa-alt">Add to Home Screen appears in Safari — not Chrome or Firefox on iPhone.</p>`
              : inApp
                ? `
            <ol>
              <li>This in-app browser cannot install apps</li>
              <li>Tap the menu and choose <strong>Open in Chrome</strong> / <strong>Open in browser</strong></li>
              <li>Then install KoS from the real browser</li>
            </ol>
            <p class="kos-pwa-alt">Or copy this page link and paste it into Chrome.</p>`
                : `
            <ol>
              <li>Tap <strong>Install KoS</strong> below</li>
              <li>Confirm install on your device</li>
              <li>Open KoS from your home screen</li>
            </ol>
            <p class="kos-pwa-alt">If Install is unavailable: open the browser menu → <strong>Install app</strong> / <strong>Add to Home screen</strong>.</p>`
          }
        </div>
        <button type="button" class="kos-pwa-install" data-action="install" ${ios || inApp ? 'hidden' : ''}>Install KoS</button>
        ${inApp && !ios ? `<button type="button" class="kos-pwa-check" data-action="copy">Copy page link</button>` : ''}
        <button type="button" class="kos-pwa-check" data-action="recheck">I added it — Recheck</button>
        <p class="kos-pwa-status" hidden></p>
      </div>
    `
  }

  private bind(): void {
    if (!this.root) return
    this.root.addEventListener('click', async (e) => {
      const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
      if (!t) return
      const action = t.getAttribute('data-action')
      if (action === 'install') await this.promptInstall()
      if (action === 'recheck') this.refreshUi(true)
      if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(location.href)
          this.setStatus('Link copied. Paste it in Chrome or Safari.')
        } catch {
          this.setStatus(location.href)
        }
      }
    })
  }

  private async promptInstall(): Promise<void> {
    if (!this.deferred) {
      this.setStatus('Install prompt not available. Use your browser menu → Add to Home screen.')
      return
    }
    await this.deferred.prompt()
    try {
      const choice = await this.deferred.userChoice
      if (choice.outcome === 'accepted') {
        this.setStatus('Installed. Close this tab and open KoS from your home screen.')
      } else {
        this.setStatus('Install dismissed. You need the home screen icon to play.')
      }
    } catch {
      this.setStatus('Install failed. Try the browser menu → Install app.')
    }
    this.deferred = null
    this.refreshUi()
  }

  private refreshUi(fromRecheck = false): void {
    if (!this.requiresInstall()) {
      this.destroy()
      this.onUnlocked?.()
      return
    }
    if (!this.root) return
    const btn = this.root.querySelector('[data-action="install"]') as HTMLButtonElement | null
    if (btn && !isIos() && !isInAppBrowser()) {
      btn.hidden = false
      btn.disabled = !this.deferred
      btn.textContent = this.deferred ? 'Install KoS' : 'Open in Chrome, then Install'
    }
    if (fromRecheck) {
      this.setStatus(
        'Still in the browser tab. Close this page and open the KoS home-screen icon.'
      )
    }
  }

  private setStatus(text: string): void {
    const el = this.root?.querySelector('.kos-pwa-status') as HTMLElement | null
    if (!el) return
    el.hidden = !text
    el.textContent = text
  }

  private ensureStyles(): void {
    if (document.getElementById('kos-pwa-styles')) return
    const style = document.createElement('style')
    style.id = 'kos-pwa-styles'
    style.textContent = `
      #kos-pwa-gate {
        position: fixed; inset: 0; z-index: 80;
        display: flex; align-items: center; justify-content: center;
        padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        background:
          radial-gradient(120% 80% at 50% 0%, rgba(26,95,255,0.28), transparent 55%),
          linear-gradient(160deg, #071018 0%, #0d1a2e 45%, #081018 100%);
        font-family: "Outfit", "Segoe UI", system-ui, sans-serif;
        color: #eef3ff;
      }
      #kos-pwa-gate .kos-pwa-card {
        width: min(440px, 100%);
        text-align: center;
        background: rgba(8, 14, 24, 0.72);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 18px;
        padding: 28px 22px 24px;
        backdrop-filter: blur(14px);
        box-shadow: 0 24px 60px rgba(0,0,0,0.45);
      }
      #kos-pwa-gate .kos-pwa-logo { width: 120px; height: auto; margin: 0 auto 10px; display: block; }
      #kos-pwa-gate h1 { margin: 0 0 8px; font-size: 1.55rem; letter-spacing: -0.02em; }
      #kos-pwa-gate .kos-pwa-lead { margin: 0 0 16px; color: rgba(230,238,255,0.78); font-size: 0.95rem; line-height: 1.45; }
      #kos-pwa-gate ol { margin: 0 0 14px; padding-left: 1.2rem; text-align: left; color: rgba(230,238,255,0.9); line-height: 1.55; }
      #kos-pwa-gate .kos-pwa-share { display: inline-block; vertical-align: -3px; color: #7eb6ff; margin: 0 2px; }
      #kos-pwa-gate .kos-pwa-alt { margin: 0 0 14px; font-size: 0.82rem; color: rgba(230,238,255,0.65); line-height: 1.4; }
      #kos-pwa-gate button {
        width: 100%; border: 0; border-radius: 12px; padding: 13px 16px; margin-top: 8px;
        font: inherit; font-weight: 700; cursor: pointer;
      }
      #kos-pwa-gate .kos-pwa-install { background: #1a5fff; color: #fff; }
      #kos-pwa-gate .kos-pwa-install:disabled { opacity: 0.55; cursor: wait; }
      #kos-pwa-gate .kos-pwa-check { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.12); }
      #kos-pwa-gate .kos-pwa-status { margin: 12px 0 0; color: #ffd27a; font-size: 0.85rem; }
    `
    document.head.appendChild(style)
  }
}
