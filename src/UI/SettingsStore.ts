import { Key } from '../Input/KeyBinding'
import { isTouchDevice } from './MobileDevice'

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

export type MobileControlId =
  | 'joystick'
  | 'fire'
  | 'aim'
  | 'jump'
  | 'crouch'
  | 'reload'
  | 'walk'
  | 'weapon1'
  | 'weapon2'
  | 'weapon3'
  | 'leanLeft'
  | 'leanRight'
  | 'scoreboard'
  | 'console'

export interface MobileControlSlot {
  x: number
  y: number
  size: number
  opacity: number
  visible: boolean
}

export type MobileLayoutMap = Record<MobileControlId, MobileControlSlot>

export type MobileHoldMode = 'hold' | 'toggle'
export type MobilePerfProfile = 'smooth' | 'balanced' | 'quality'
/** `normal` renders at the screen's own aspect; `4:3` renders 4:3 and stretches (CS-style). */
export type MobileResMode = 'normal' | '4:3'
/** Internal backbuffer when mobile Video is set to 4:3. */
export type MobileRes43 = '1280x960' | '1440x1080'

export const MOBILE_RES_43_PRESETS: ReadonlyArray<{
  key: MobileRes43
  width: number
  height: number
  label: string
}> = [
  { key: '1280x960', width: 1280, height: 960, label: '1280×960' },
  { key: '1440x1080', width: 1440, height: 1080, label: '1440×1080' },
]

export function parseMobileRes43(key: MobileRes43): { width: number; height: number } {
  const hit = MOBILE_RES_43_PRESETS.find((p) => p.key === key)
  return hit ? { width: hit.width, height: hit.height } : { width: 1280, height: 960 }
}

export interface MobileControlsSettings {
  enabled: boolean
  lookSensitivity: number
  joystickDeadzone: number
  layout: MobileLayoutMap
  crouchMode: MobileHoldMode
  leanMode: MobileHoldMode
  perfProfile: MobilePerfProfile
  resMode: MobileResMode
  /** Used only when `resMode === '4:3'`. */
  res43: MobileRes43
}

export type HudStyle = 'kos' | 'cs-green'

export interface PlayerSettings {
  playerName: string
  crosshair: CrosshairSettings
  keybinds: KeybindMap
  jumpWithScrollWheel: boolean
  sensitivity: number
  zoomSensitivity: number
  volume: number
  musicVolume: number
  fpsMax: number
  resolutionWidth: number
  resolutionHeight: number
  graphicsQuality: 'low' | 'medium' | 'high'
  /** In-match HUD skin */
  hudStyle: HudStyle
  mobile: MobileControlsSettings
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

export const MOBILE_CONTROL_META: Array<{ id: MobileControlId; label: string; glyph: string }> = [
  { id: 'joystick', label: 'Move Stick', glyph: '⊕' },
  { id: 'fire', label: 'Fire', glyph: '◎' },
  { id: 'aim', label: 'Aim / Scope', glyph: '⌖' },
  { id: 'jump', label: 'Jump', glyph: '⤒' },
  { id: 'crouch', label: 'Crouch', glyph: '⤓' },
  { id: 'reload', label: 'Reload', glyph: '↻' },
  { id: 'weapon1', label: 'AK / Primary', glyph: 'AK' },
  { id: 'weapon2', label: 'Pistol', glyph: 'P' },
  { id: 'weapon3', label: 'Butterfly', glyph: 'K' },
  { id: 'leanLeft', label: 'Lean Left', glyph: '◁' },
  { id: 'leanRight', label: 'Lean Right', glyph: '▷' },
  { id: 'scoreboard', label: 'Scoreboard', glyph: '☰' },
  { id: 'console', label: 'Console', glyph: '💬' },
]

export const DEFAULT_MOBILE_LAYOUT: MobileLayoutMap = {
  joystick: { x: 15, y: 73, size: 1.22, opacity: 0.58, visible: true },
  fire: { x: 86, y: 74, size: 1.32, opacity: 0.78, visible: true },
  aim: { x: 71, y: 78, size: 1.02, opacity: 0.68, visible: true },
  jump: { x: 87, y: 55, size: 1.05, opacity: 0.7, visible: true },
  crouch: { x: 73, y: 59, size: 0.95, opacity: 0.65, visible: true },
  reload: { x: 90, y: 39, size: 0.9, opacity: 0.62, visible: true },
  walk: { x: 28, y: 88, size: 0.8, opacity: 0.55, visible: false },
  weapon1: { x: 62, y: 17, size: 0.8, opacity: 0.6, visible: true },
  weapon2: { x: 72, y: 17, size: 0.8, opacity: 0.6, visible: true },
  weapon3: { x: 82, y: 17, size: 0.8, opacity: 0.6, visible: true },
  leanLeft: { x: 8, y: 48, size: 0.78, opacity: 0.52, visible: true },
  leanRight: { x: 22, y: 48, size: 0.78, opacity: 0.52, visible: true },
  scoreboard: { x: 50, y: 12, size: 0.78, opacity: 0.62, visible: true },
  console: { x: 38, y: 12, size: 0.78, opacity: 0.62, visible: true },
}

export function clampMobileSlot(slot: Partial<MobileControlSlot> | undefined, fallback: MobileControlSlot): MobileControlSlot {
  const base = { ...fallback, ...(slot || {}) }
  return {
    x: Math.max(2, Math.min(98, Number.isFinite(base.x) ? base.x : fallback.x)),
    y: Math.max(4, Math.min(96, Number.isFinite(base.y) ? base.y : fallback.y)),
    size: Math.max(0.55, Math.min(1.8, Number.isFinite(base.size) ? base.size : fallback.size)),
    opacity: Math.max(0.15, Math.min(1, Number.isFinite(base.opacity) ? base.opacity : fallback.opacity)),
    visible: base.visible !== false,
  }
}

export function normalizeMobileLayout(raw?: Partial<MobileLayoutMap>): MobileLayoutMap {
  const out = { ...DEFAULT_MOBILE_LAYOUT }
  for (const id of Object.keys(DEFAULT_MOBILE_LAYOUT) as MobileControlId[]) {
    out[id] = clampMobileSlot(raw?.[id], DEFAULT_MOBILE_LAYOUT[id])
  }
  out.walk = { ...out.walk, visible: false }
  return out
}

export function defaultMobileSettings(): MobileControlsSettings {
  return {
    enabled: true,
    lookSensitivity: 1.15,
    joystickDeadzone: 0.18,
    layout: normalizeMobileLayout(),
    crouchMode: 'hold',
    leanMode: 'hold',
    perfProfile: 'balanced',
    resMode: 'normal',
    res43: '1280x960',
  }
}

function normalizeHoldMode(v: unknown, fallback: MobileHoldMode): MobileHoldMode {
  return v === 'toggle' || v === 'hold' ? v : fallback
}

function normalizePerfProfile(v: unknown, fallback: MobilePerfProfile): MobilePerfProfile {
  return v === 'smooth' || v === 'balanced' || v === 'quality' ? v : fallback
}

function normalizeResMode(v: unknown, fallback: MobileResMode): MobileResMode {
  return v === 'normal' || v === '4:3' ? v : fallback
}

function normalizeRes43(v: unknown, fallback: MobileRes43): MobileRes43 {
  return v === '1280x960' || v === '1440x1080' ? v : fallback
}

export function normalizeMobileSettings(raw?: Partial<MobileControlsSettings>): MobileControlsSettings {
  const d = defaultMobileSettings()
  return {
    enabled: raw?.enabled !== false,
    lookSensitivity: Math.max(0.2, Math.min(3, typeof raw?.lookSensitivity === 'number' ? raw.lookSensitivity : d.lookSensitivity)),
    joystickDeadzone: Math.max(0.05, Math.min(0.45, typeof raw?.joystickDeadzone === 'number' ? raw.joystickDeadzone : d.joystickDeadzone)),
    layout: normalizeMobileLayout(raw?.layout),
    crouchMode: normalizeHoldMode(raw?.crouchMode, d.crouchMode),
    leanMode: normalizeHoldMode(raw?.leanMode, d.leanMode),
    perfProfile: normalizePerfProfile(raw?.perfProfile, d.perfProfile),
    resMode: normalizeResMode(raw?.resMode, d.resMode),
    res43: normalizeRes43(raw?.res43, d.res43),
  }
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
      // Phones always run at their own refresh rate; there is no cap to pick.
      fpsMax: isTouchDevice()
        ? 0
        : typeof parsed.fpsMax === 'number' && Number.isFinite(parsed.fpsMax)
          ? Math.max(0, Math.min(999, Math.floor(parsed.fpsMax)))
          : 0,
      resolutionWidth: res.width,
      resolutionHeight: res.height,
      graphicsQuality:
        parsed.graphicsQuality === 'low' || parsed.graphicsQuality === 'medium' || parsed.graphicsQuality === 'high'
          ? parsed.graphicsQuality
          : 'high',
      hudStyle: parsed.hudStyle === 'kos' ? 'kos' : 'cs-green',
      mobile: normalizeMobileSettings(parsed.mobile),
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
    graphicsQuality: 'high',
    hudStyle: 'cs-green',
    mobile: defaultMobileSettings(),
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
  { key: Key.Three, label: 'Butterfly' },
  { key: Key.Left_Click, label: 'Fire' },
  { key: Key.Right_Click, label: 'AWP Scope' },
  { key: Key.SwitchHands, label: 'Toggle Switch Hands' },
]
