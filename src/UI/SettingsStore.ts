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
  /** CS-style: mouse wheel up/down also jumps */
  jumpWithScrollWheel: boolean
  /** Mouse look multiplier (1 = default). Console: sensitivity */
  sensitivity: number
  /** Scoped look scale vs hipfire (console: zoom_sensitivity). CS default 1 */
  zoomSensitivity: number
  /** Master SFX 0..1 (console: volume) */
  volume: number
  /** Menu / background music 0..1 (console: MP3Volume / bgmvolume) */
  musicVolume: number
  /** fps_max — 0 = unlimited */
  fpsMax: number
  /** Internal render resolution (aspect from w/h). */
  resolutionWidth: number
  resolutionHeight: number
}

export type AspectGroup = '4:3' | '16:9' | '16:10'

export type ResolutionPreset = {
  aspect: AspectGroup
  width: number
  height: number
  recommended?: boolean
}

/** CS-style resolution list for the Video settings tab. */
export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  // 4:3
  { aspect: '4:3', width: 640, height: 480 },
  { aspect: '4:3', width: 800, height: 600 },
  { aspect: '4:3', width: 960, height: 720 },
  { aspect: '4:3', width: 1024, height: 768 },
  { aspect: '4:3', width: 1152, height: 864 },
  { aspect: '4:3', width: 1280, height: 960, recommended: true },
  { aspect: '4:3', width: 1400, height: 1050 },
  { aspect: '4:3', width: 1440, height: 1080, recommended: true },
  // 16:9
  { aspect: '16:9', width: 1024, height: 576 },
  { aspect: '16:9', width: 1152, height: 648 },
  { aspect: '16:9', width: 1280, height: 720 },
  { aspect: '16:9', width: 1360, height: 768 },
  { aspect: '16:9', width: 1366, height: 768 },
  { aspect: '16:9', width: 1600, height: 900 },
  { aspect: '16:9', width: 1920, height: 1080, recommended: true },
  // 16:10
  { aspect: '16:10', width: 1024, height: 640 },
  { aspect: '16:10', width: 1280, height: 800 },
  { aspect: '16:10', width: 1440, height: 900, recommended: true },
  { aspect: '16:10', width: 1680, height: 1050, recommended: true },
]

export function resolutionKey(w: number, h: number): string {
  return `${w}x${h}`
}

export function findResolutionPreset(w: number, h: number): ResolutionPreset | undefined {
  return RESOLUTION_PRESETS.find((p) => p.width === w && p.height === h)
}

export function normalizeResolution(w: number, h: number): { width: number; height: number } {
  const hit = findResolutionPreset(w, h)
  if (hit) return { width: hit.width, height: hit.height }
  return { width: 1280, height: 960 }
}

/** Clamp / sanitize mouse sensitivity (CS-style range). */
export function clampSensitivity(v: number): number {
  if (!Number.isFinite(v)) return 3
  return Math.max(0.01, Math.min(20, Math.round(v * 100) / 100))
}

export function clampZoomSensitivity(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.max(0.01, Math.min(5, Math.round(v * 1000) / 1000))
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100))
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
    const res = normalizeResolution(
      typeof parsed.resolutionWidth === 'number' ? parsed.resolutionWidth : 1280,
      typeof parsed.resolutionHeight === 'number' ? parsed.resolutionHeight : 960
    )
    return {
      playerName: typeof parsed.playerName === 'string' ? parsed.playerName.slice(0, 24) : '',
      crosshair: { ...DEFAULT_CROSSHAIR, ...(parsed.crosshair || {}) },
      keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds || {}) },
      jumpWithScrollWheel: parsed.jumpWithScrollWheel !== false,
      sensitivity: clampSensitivity(
        typeof parsed.sensitivity === 'number' ? parsed.sensitivity : 3
      ),
      zoomSensitivity: clampZoomSensitivity(
        typeof parsed.zoomSensitivity === 'number' ? parsed.zoomSensitivity : 1
      ),
      volume: clampVolume(typeof parsed.volume === 'number' ? parsed.volume : 1),
      musicVolume: clampVolume(
        typeof parsed.musicVolume === 'number' ? parsed.musicVolume : 0.38
      ),
      fpsMax:
        typeof parsed.fpsMax === 'number' && Number.isFinite(parsed.fpsMax)
          ? Math.max(0, Math.min(999, Math.floor(parsed.fpsMax)))
          : 0,
      resolutionWidth: res.width,
      resolutionHeight: res.height,
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
    jumpWithScrollWheel: true,
    sensitivity: 3,
    zoomSensitivity: 1,
    volume: 1,
    musicVolume: 0.38,
    fpsMax: 0,
    resolutionWidth: 1280,
    resolutionHeight: 960,
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
  { key: Key.Right_Click, label: 'AWP Scope' },
  { key: Key.SwitchHands, label: 'Toggle Switch Hands' },
]
