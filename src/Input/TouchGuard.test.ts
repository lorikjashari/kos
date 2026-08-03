// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  dropStraySelection,
  installTouchGuard,
  isAimSurface,
  isEditableTarget,
} from './TouchGuard'

let teardown: () => void

beforeEach(() => {
  document.body.innerHTML = `
    <canvas id="kos-gl"></canvas>
    <div id="kos-mobile-controls">
      <div class="kos-mc-look"><span class="deep">nested</span></div>
      <button class="kos-mc-btn" data-id="jump">Jump</button>
    </div>
    <div id="menu">
      <p id="prose">Room ABCD</p>
      <input id="name" value="player" />
    </div>
  `
  teardown = installTouchGuard(document)
})

afterEach(() => teardown())

/** jsdom has no TouchEvent constructor; the guard only reads target/cancelable. */
function fireTouch(type: 'touchstart' | 'touchmove', target: Element): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function select(node: Node): void {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

describe('target classification', () => {
  it('treats the aim layer and the canvas as aim surfaces', () => {
    expect(isAimSurface(document.querySelector('.kos-mc-look'))).toBe(true)
    expect(isAimSurface(document.querySelector('#kos-gl'))).toBe(true)
  })

  it('counts a node nested in the aim layer as the aim surface', () => {
    expect(isAimSurface(document.querySelector('.deep'))).toBe(true)
  })

  it('does not treat on-screen buttons or menu prose as aim surfaces', () => {
    expect(isAimSurface(document.querySelector('.kos-mc-btn'))).toBe(false)
    expect(isAimSurface(document.querySelector('#prose'))).toBe(false)
  })

  it('recognises text fields as editable', () => {
    expect(isEditableTarget(document.querySelector('#name'))).toBe(true)
    expect(isEditableTarget(document.querySelector('#prose'))).toBe(false)
  })
})

describe('touch handling', () => {
  it('cancels touches on the aim surface so Safari drops the selection gesture', () => {
    const event = fireTouch('touchstart', document.querySelector('.kos-mc-look')!)
    expect(event.defaultPrevented).toBe(true)
  })

  it('cancels drags across the aim surface', () => {
    const event = fireTouch('touchmove', document.querySelector('.kos-mc-look')!)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves control buttons alone so their taps still register', () => {
    const event = fireTouch('touchstart', document.querySelector('.kos-mc-btn')!)
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves text fields alone so the keyboard and caret still work', () => {
    const event = fireTouch('touchstart', document.querySelector('#name')!)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('selection suppression', () => {
  it('blocks a selection starting outside a text field', () => {
    const event = new Event('selectstart', { bubbles: true, cancelable: true })
    document.querySelector('#prose')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('allows a selection inside a text field', () => {
    const event = new Event('selectstart', { bubbles: true, cancelable: true })
    document.querySelector('#name')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('tears down a stray selection, which is what the loupe hangs off', () => {
    select(document.querySelector('#prose')!)
    expect(document.getSelection()!.isCollapsed).toBe(false)
    dropStraySelection(document)
    expect(document.getSelection()!.isCollapsed).toBe(true)
  })

  it('keeps a selection while a text field holds focus', () => {
    const input = document.querySelector('#name') as HTMLInputElement
    input.focus()
    select(document.querySelector('#prose')!)
    dropStraySelection(document)
    expect(document.getSelection()!.isCollapsed).toBe(false)
  })

  it('clears a stray selection when a touch lands on the aim surface', () => {
    select(document.querySelector('#prose')!)
    fireTouch('touchstart', document.querySelector('.kos-mc-look')!)
    expect(document.getSelection()!.isCollapsed).toBe(true)
  })
})

describe('pinch zoom', () => {
  it('cancels Safari gesture events', () => {
    const event = new Event('gesturestart', { bubbles: true, cancelable: true })
    document.querySelector('.kos-mc-look')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
