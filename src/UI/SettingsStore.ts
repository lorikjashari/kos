import { Key } from '../Input/KeyBinding'

export type CrosshairStyle = 0 | 1 | 2 | 3 | 4 | 5

/** KoS crosshair settings */
export interface CrosshairSettings {
  style: CrosshairStyle
  size: number
  thickness: number
  gap: number
  colorR: number
  colorG: number
  colorB: number
  alpha: number
  outline: boolean
  outlineThickness: number
  outlineOpacity: number
  centerDot: boolean
  dotSize: number
  tStyle: boolean
}

export type KeybindMap = Partial<Record<Key, string>>

export interface PlayerSettings {
  playerName: string
  crosshair: CrosshairSettings
  keybinds: KeybindMap
}

export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  style: 2,
  size: 3,
  thickness: 1,
  gap: -2,
  colorR: 0,
  colorG: 255,
  colorB: 0,
  alpha: 1,
  outline: true,
  outlineThickness: 1,
  outlineOpacity: 1,
  centerDot: false,
  dotSize: 1,
  tStyle: false,
}

/** Default keyboard codes (event.key, lowercased where letters) */
export const DEFAULT_KEYBINDS: Record<Key, string> = {
  [Key.Forward]: 'w',
  [Key.Backward]: 's',
  [Key.Left]: 'a',
  [Key.Right]: 'd',
  [Key.Jump]: ' ',
  [Key.Shift]: 'shift',
  [Key.Crouch]: 'c',
  [Key.LeanLeft]: 'q',
  [Key.LeanRight]: 'e',
  [Key.Reload]: 'r',
  [Key.One]: '1',
  [Key.Two]: '2',
  [Key.Three]: '3',
  [Key.Four]: '4',
  [Key.Left_Click]: 'mouse0',
  [Key.Right_Click]: 'mouse2',
  [Key.SwitchHands]: 'h',
}

const STORAGE_KEY = 'kos-settings-v1'

export function loadSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<PlayerSettings>
    return {
      playerName: typeof parsed.playerName === 'string' ? parsed.playerName.slice(0, 24) : '',
      crosshair: { ...DEFAULT_CROSSHAIR, ...(parsed.crosshair || {}) },
      keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds || {}) },
    }
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings: PlayerSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function defaultSettings(): PlayerSettings {
  return {
    playerName: '',
    crosshair: { ...DEFAULT_CROSSHAIR },
    keybinds: { ...DEFAULT_KEYBINDS },
  }
}

export function formatKeyLabel(code: string): string {
  if (code === ' ') return 'SPACE'
  if (code === 'mouse0') return 'LMB'
  if (code === 'mouse2') return 'RMB'
  if (code === 'mouse1') return 'MMB'
  return code.toUpperCase()
}

/** Actions the player can rebind (no mouse fire by default in list — still shown) */
export const REBINDABLE_ACTIONS: Array<{ key: Key; label: string }> = [
  { key: Key.Forward, label: 'Move Forward' },
  { key: Key.Backward, label: 'Move Backward' },
  { key: Key.Left, label: 'Move Left' },
  { key: Key.Right, label: 'Move Right' },
  { key: Key.Jump, label: 'Jump' },
  { key: Key.Crouch, label: 'Crouch' },
  { key: Key.Shift, label: 'Walk' },
  { key: Key.Reload, label: 'Reload' },
  { key: Key.LeanLeft, label: 'Lean Left' },
  { key: Key.LeanRight, label: 'Lean Right' },
  { key: Key.One, label: 'Primary Weapon' },
  { key: Key.Two, label: 'Secondary Weapon' },
  { key: Key.Three, label: 'Knife' },
  { key: Key.Left_Click, label: 'Fire' },
  { key: Key.Right_Click, label: 'Zoom / ADS' },
  { key: Key.SwitchHands, label: 'Toggle Switch Hands' },
]
