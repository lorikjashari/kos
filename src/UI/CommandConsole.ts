/**
 * Minimal slash-command bar. Press `/` to open, Enter to run, Esc to close.
 */
export class CommandConsole {
  private root: HTMLDivElement
  private input: HTMLInputElement
  private open = false
  private onCommand: (line: string) => void | Promise<void>
  private onClose: () => void

  constructor(handlers: { onCommand: (line: string) => void | Promise<void>; onClose: () => void }) {
    this.onCommand = handlers.onCommand
    this.onClose = handlers.onClose

    this.root = document.createElement('div')
    this.root.id = 'kos-cmd'
    this.root.innerHTML = `
      <div class="kos-cmd-bar">
        <span class="kos-cmd-prefix">/</span>
        <input id="kos-cmd-input" type="text" maxlength="64" autocomplete="off" spellcheck="false" placeholder="editormode" />
      </div>
    `
    const style = document.createElement('style')
    style.textContent = `
      #kos-cmd {
        display: none;
        position: fixed;
        left: 50%;
        bottom: 18%;
        transform: translateX(-50%);
        z-index: 10050;
        pointer-events: auto;
      }
      #kos-cmd.is-open { display: block; }
      .kos-cmd-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: min(420px, 86vw);
        padding: 10px 14px;
        background: rgba(8, 12, 20, 0.92);
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 8px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.45);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .kos-cmd-prefix {
        color: #7dd3fc;
        font-weight: 700;
        font-size: 16px;
      }
      #kos-cmd-input {
        flex: 1;
        background: transparent;
        border: 0;
        outline: none;
        color: #f8fafc;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      #kos-cmd-input::placeholder { color: #64748b; font-weight: 500; }
    `
    document.head.appendChild(style)
    document.body.appendChild(this.root)
    this.input = this.root.querySelector('#kos-cmd-input') as HTMLInputElement

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const raw = this.input.value.trim()
        this.close()
        if (raw) void this.onCommand(raw.replace(/^\//, ''))
      }
    })
  }

  public isOpen(): boolean {
    return this.open
  }

  public show(prefill = ''): void {
    this.open = true
    this.root.classList.add('is-open')
    this.input.value = prefill
    requestAnimationFrame(() => {
      this.input.focus()
      this.input.select()
    })
  }

  public close(): void {
    if (!this.open) return
    this.open = false
    this.root.classList.remove('is-open')
    this.input.blur()
    this.onClose()
  }
}
