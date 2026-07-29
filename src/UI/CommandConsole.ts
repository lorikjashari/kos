/**
 * Counter-Strike 1.6 style developer console.
 * Toggle with the backtick (`) key. Type a command + Enter (or Submit) to run.
 * Output is echoed CS-style with a leading "] ".
 */
export class CommandConsole {
  private root: HTMLDivElement
  private input: HTMLInputElement
  private log: HTMLDivElement
  private open = false
  private seeded = false
  private history: string[] = []
  private historyIdx = -1
  private onCommand: (line: string) => void | Promise<void>
  private onClose: () => void

  constructor(handlers: { onCommand: (line: string) => void | Promise<void>; onClose: () => void }) {
    this.onCommand = handlers.onCommand
    this.onClose = handlers.onClose

    this.root = document.createElement('div')
    this.root.id = 'kos-con'
    this.root.innerHTML = `
      <div class="kos-con-win">
        <div class="kos-con-title">
          <span class="kos-con-ico"></span>
          <span class="kos-con-name">Console</span>
          <button type="button" class="kos-con-x" title="Close">✕</button>
        </div>
        <div class="kos-con-log" id="kos-con-log"></div>
        <div class="kos-con-bottom">
          <input id="kos-con-input" type="text" maxlength="120" autocomplete="off" spellcheck="false" />
          <button type="button" class="kos-con-submit" id="kos-con-submit">Submit</button>
        </div>
      </div>
    `

    const style = document.createElement('style')
    style.textContent = `
      #kos-con {
        display: none;
        position: fixed;
        left: 50%;
        top: 6%;
        transform: translateX(-50%);
        z-index: 10050;
        pointer-events: auto;
      }
      #kos-con.is-open { display: block; }
      .kos-con-win {
        display: flex;
        flex-direction: column;
        width: min(660px, 94vw);
        height: min(460px, 74vh);
        background: #0b0b0d;
        border: 1px solid #3a3f45;
        box-shadow: 0 18px 60px rgba(0,0,0,0.6);
        font-family: "Lucida Console", Consolas, "Courier New", monospace;
      }
      .kos-con-title {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 26px;
        padding: 0 6px;
        background: linear-gradient(#2b3138, #1c2126);
        border-bottom: 1px solid #000;
        user-select: none;
      }
      .kos-con-ico {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #9fd0ff, #2b6cb0 70%, #16324d);
        box-shadow: 0 0 0 1px #0b0b0d, 0 0 4px rgba(120,180,255,0.5);
        flex: 0 0 auto;
      }
      .kos-con-name {
        color: #e8e8e8;
        font-size: 12px;
        letter-spacing: 0.02em;
        flex: 1;
      }
      .kos-con-x {
        width: 20px;
        height: 18px;
        line-height: 16px;
        text-align: center;
        color: #e8e8e8;
        background: #3a4149;
        border: 1px solid #12151a;
        cursor: pointer;
        font-size: 11px;
        padding: 0;
      }
      .kos-con-x:hover { background: #b23; color: #fff; }
      .kos-con-log {
        flex: 1;
        overflow-y: auto;
        padding: 6px 8px;
        background: #050506;
        color: #c9ccc9;
        font-size: 12.5px;
        line-height: 1.35;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .kos-con-log .echo { color: #d8d8b0; }
      .kos-con-log .warn { color: #e0a04a; }
      .kos-con-log .ok { color: #8fd08f; }
      .kos-con-log::-webkit-scrollbar { width: 14px; }
      .kos-con-log::-webkit-scrollbar-track { background: #17181b; }
      .kos-con-log::-webkit-scrollbar-thumb { background: #3a4149; border: 2px solid #17181b; }
      .kos-con-bottom {
        display: flex;
        gap: 6px;
        padding: 6px;
        background: #16181b;
        border-top: 1px solid #000;
      }
      #kos-con-input {
        flex: 1;
        background: #050506;
        border: 1px solid #3a3f45;
        outline: none;
        color: #e8e8e8;
        font-family: inherit;
        font-size: 12.5px;
        padding: 4px 6px;
      }
      .kos-con-submit {
        min-width: 74px;
        color: #eaeaea;
        background: linear-gradient(#4a5159, #333940);
        border: 1px solid #12151a;
        border-top-color: #6b7278;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        padding: 4px 10px;
      }
      .kos-con-submit:active { background: linear-gradient(#333940, #4a5159); }
    `
    document.head.appendChild(style)
    document.body.appendChild(this.root)

    this.input = this.root.querySelector('#kos-con-input') as HTMLInputElement
    this.log = this.root.querySelector('#kos-con-log') as HTMLDivElement

    this.root.querySelector('.kos-con-x')?.addEventListener('click', () => this.close())
    this.root.querySelector('#kos-con-submit')?.addEventListener('click', () => this.submit())
    // Clicking anywhere in the window keeps focus on the input
    this.root.querySelector('.kos-con-win')?.addEventListener('mousedown', (e) => {
      const t = e.target as HTMLElement
      if (t.tagName !== 'BUTTON') {
        e.preventDefault()
        this.input.focus()
      }
    })

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      // Backtick closes the console (CS 1.6 behaviour) and never types the char
      if (e.key === '`' || e.key === '~' || e.code === 'Backquote') {
        e.preventDefault()
        this.close()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        this.submit()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.recall(-1)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.recall(1)
      }
    })
  }

  private seed(): void {
    if (this.seeded) return
    this.seeded = true
    const lines = [
      'KoS  —  Console',
      'Counter-Strike style developer console',
      '] version',
      'Protocol version 48',
      'Exe version 1.1.2.6/2.0.0.0 (cstrike)',
      "Type a command and press Enter. Press ` to close.",
      "Type 'help' for a list of commands.",
      '',
    ]
    for (const l of lines) this.print(l)
  }

  private submit(): void {
    const raw = this.input.value.trim()
    this.input.value = ''
    if (!raw) return
    this.history.push(raw)
    if (this.history.length > 50) this.history.shift()
    this.historyIdx = this.history.length
    this.print('] ' + raw, 'echo')
    void this.onCommand(raw.replace(/^[/`]+/, ''))
  }

  private recall(dir: number): void {
    if (this.history.length === 0) return
    this.historyIdx = Math.max(0, Math.min(this.history.length, this.historyIdx + dir))
    this.input.value = this.history[this.historyIdx] ?? ''
    requestAnimationFrame(() => {
      const n = this.input.value.length
      this.input.setSelectionRange(n, n)
    })
  }

  /** Append a line to the console log. */
  public print(text: string, kind: '' | 'echo' | 'warn' | 'ok' = ''): void {
    const line = document.createElement('div')
    if (kind) line.className = kind
    line.textContent = text
    this.log.appendChild(line)
    this.log.scrollTop = this.log.scrollHeight
  }

  public clear(): void {
    this.log.innerHTML = ''
  }

  public isOpen(): boolean {
    return this.open
  }

  public show(prefill = ''): void {
    this.seed()
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

  public toggle(): void {
    if (this.open) this.close()
    else this.show()
  }
}
