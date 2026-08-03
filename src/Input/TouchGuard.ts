/**
 * Suppresses the iOS text-selection furniture that fires during play.
 *
 * Safari starts a selection from a long press followed by a drag, which is the
 * exact gesture used to aim, and then floats its magnifier loupe plus the
 * "Copy / Look Up / Search Web" callout over the middle of the screen. Neither
 * `touch-action: none` nor `preventDefault()` on a pointer event stops it —
 * Safari only treats the gesture as consumed if the underlying touch event is
 * cancelled — so the touch has to be cancelled over the aim surface, and any
 * selection that still slips through torn down before the loupe can draw.
 */

/** Somewhere the player legitimately needs a caret and a selection. */
export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** Full-bleed surfaces whose only job is to receive aim and fire drags. */
export const AIM_SURFACE_SELECTOR = '#kos-gl, #kos-mobile-controls .kos-mc-look'

function elementFor(target: EventTarget | Node | null): Element | null {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

export function isEditableTarget(target: EventTarget | Node | null): boolean {
  return !!elementFor(target)?.closest(EDITABLE_SELECTOR)
}

export function isAimSurface(target: EventTarget | Node | null): boolean {
  return !!elementFor(target)?.closest(AIM_SURFACE_SELECTOR)
}

/**
 * Collapses a selection the player never asked for. The loupe and the callout
 * both hang off a live selection, so dropping it makes them disappear.
 */
export function dropStraySelection(doc: Document): void {
  if (isEditableTarget(doc.activeElement)) return
  const selection = doc.getSelection()
  if (!selection || selection.isCollapsed) return
  if (isEditableTarget(selection.anchorNode)) return
  selection.removeAllRanges()
}

/** Installs the guard and returns a teardown for symmetry in tests. */
export function installTouchGuard(doc: Document): () => void {
  const capture: AddEventListenerOptions = { passive: false, capture: true }

  const onTouch = (event: Event): void => {
    if (isEditableTarget(event.target)) return
    dropStraySelection(doc)
    if (event.cancelable && isAimSurface(event.target)) event.preventDefault()
  }

  const onSelectStart = (event: Event): void => {
    if (isEditableTarget(event.target)) return
    if (event.cancelable) event.preventDefault()
  }

  const onSelectionChange = (): void => dropStraySelection(doc)

  // Safari-only pinch handlers. Without them a two-finger slip zooms the page
  // mid-fight and there is no way back to 1:1 without leaving the match.
  const onGesture = (event: Event): void => {
    if (isEditableTarget(event.target)) return
    if (event.cancelable) event.preventDefault()
  }

  const gestures = ['gesturestart', 'gesturechange', 'gestureend']

  doc.addEventListener('touchstart', onTouch, capture)
  doc.addEventListener('touchmove', onTouch, capture)
  doc.addEventListener('selectstart', onSelectStart, capture)
  doc.addEventListener('selectionchange', onSelectionChange)
  for (const type of gestures) doc.addEventListener(type, onGesture, capture)

  return () => {
    doc.removeEventListener('touchstart', onTouch, capture)
    doc.removeEventListener('touchmove', onTouch, capture)
    doc.removeEventListener('selectstart', onSelectStart, capture)
    doc.removeEventListener('selectionchange', onSelectionChange)
    for (const type of gestures) doc.removeEventListener(type, onGesture, capture)
  }
}
