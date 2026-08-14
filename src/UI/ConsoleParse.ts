export const CONSOLE_COMMANDS: string[] = [
  'help',
  'cmdlist',
  'clear',
  'cls',
  'echo',
  'toggleconsole',
  'crosshair',
  'cl_crosshair_size',
  'cl_crosshair_color',
  'cl_dynamiccrosshair',
  'cl_observercrosshair',
  'cl_showfps',
  'net_graph',
  'net_graphpos',
  'net_graphwidth',
  'volume',
  'mp3volume',
  'bgmvolume',
  'sensitivity',
  'sens',
  'zoom_sensitivity',
  'zoom_sensitivity_ratio',
  'fps_max',
  'fps_override',
  'rate',
  'cl_cmdrate',
  'cl_updaterate',
  'ex_interp',
  'cl_lc',
  'cl_lw',
  'voice_enable',
  'voice_scale',
  'hisound',
  'suitvolume',
  'disconnect',
  'retry',
  'reconnect',
  'connect',
  'editormode',
  'record',
  'stop',
  'playdemo',
  'demolist',
  '!m9',
  'm9',
  '!karambit',
  'karambit',
]

/** Split a command line into tokens, honouring "quoted strings". */
export function tokenizeConsoleLine(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) out.push(m[1] ?? m[2] ?? '')
  return out
}

export function consoleToNum(v: string | undefined, fallback = 0): number {
  if (v === undefined) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** fps_max: 0 = uncapped; 1..24 → 24; else clamp to 999. */
export function clampFpsCap(n: number): number {
  if (n <= 0) return 0
  if (n <= 24) return 24
  return Math.min(999, Math.floor(n))
}
