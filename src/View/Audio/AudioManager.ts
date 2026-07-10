import * as THREE from 'three'

type SoundId =
  | 'ak_shot'
  | 'ak_draw'
  | 'ak_clipout'
  | 'ak_clipin'
  | 'ak_boltpull'
  | 'usp_shot'
  | 'usp_draw'
  | 'usp_clipout'
  | 'usp_clipin'
  | 'usp_slideback'
  | 'usp_sliderelease'
  | 'knife_slash'
  | 'knife_slash2'
  | 'knife_deploy'
  | 'knife_hit'
  | 'empty_rifle'
  | 'empty_pistol'
  | 'foot_tile1'
  | 'foot_tile2'
  | 'foot_tile3'
  | 'jump'
  | 'land'
  | 'weapon_select'
  | 'flesh_bullet1'
  | 'flesh_bullet2'
  | 'flesh_bullet3'
  | 'flesh_bullet4'
  | 'flesh_bullet5'
  | 'headshot1'
  | 'headshot2'
  | 'helmet_hit'
  | 'death1'
  | 'death2'
  | 'death3'
  | 'pain5'
  | 'pain6'
  | 'pain7'

const SOUND_FILES: Record<SoundId, string> = {
  // Short one-shot variants so auto-fire can overlap cleanly
  ak_shot: 'weapons/ak47/ak47-1.wav',
  ak_draw: 'weapons/ak47/ak47_draw.wav',
  ak_clipout: 'weapons/ak47/ak47_clipout.wav',
  ak_clipin: 'weapons/ak47/ak47_clipin.wav',
  ak_boltpull: 'weapons/ak47/ak47_boltpull.wav',
  usp_shot: 'weapons/usp/usp1.wav',
  usp_draw: 'weapons/usp/usp_draw.wav',
  usp_clipout: 'weapons/usp/usp_clipout.wav',
  usp_clipin: 'weapons/usp/usp_clipin.wav',
  usp_slideback: 'weapons/usp/usp_slideback.wav',
  usp_sliderelease: 'weapons/usp/usp_sliderelease.wav',
  knife_slash: 'weapons/knife/knife_slash1.wav',
  knife_slash2: 'weapons/knife/knife_slash2.wav',
  knife_deploy: 'weapons/knife/knife_deploy1.wav',
  knife_hit: 'weapons/knife/knife_hit1.wav',
  empty_rifle: 'weapons/clipempty_rifle.wav',
  empty_pistol: 'weapons/clipempty_pistol.wav',
  foot_tile1: 'player/footsteps/tile1.wav',
  foot_tile2: 'player/footsteps/tile2.wav',
  foot_tile3: 'player/footsteps/tile3.wav',
  jump: 'player/jumplanding.wav',
  land: 'player/jumplanding2.wav',
  weapon_select: 'common/wpn_select.wav',
  flesh_bullet1: 'physics/flesh/flesh_impact_bullet1.wav',
  flesh_bullet2: 'physics/flesh/flesh_impact_bullet2.wav',
  flesh_bullet3: 'physics/flesh/flesh_impact_bullet3.wav',
  flesh_bullet4: 'physics/flesh/flesh_impact_bullet4.wav',
  flesh_bullet5: 'physics/flesh/flesh_impact_bullet5.wav',
  headshot1: 'player/headshot1.wav',
  headshot2: 'player/headshot2.wav',
  helmet_hit: 'player/bhit_helmet-1.wav',
  death1: 'player/death1.wav',
  death2: 'player/death2.wav',
  death3: 'player/death3.wav',
  pain5: 'player/pl_pain5.wav',
  pain6: 'player/pl_pain6.wav',
  pain7: 'player/pl_pain7.wav',
}

/** All combat SFX — preload before first shot to avoid decode hitch */
const PRIORITY: SoundId[] = Object.keys(SOUND_FILES) as SoundId[]

/**
 * Web Audio one-shots — each play() creates a new BufferSource so AR spray
 * never cuts the previous bullet sound (HTMLAudio could not do this).
 */
export class AudioManager extends THREE.AudioListener {
  private buffers = new Map<SoundId, AudioBuffer>()
  private loading = new Set<SoundId>()
  private unlocked = false
  private footIndex = 0
  private reloadTimers: number[] = []
  private masterGain!: GainNode
  private loadStarted = false
  private ctx!: AudioContext
  private menuMusic: HTMLAudioElement | null = null
  private menuMusicWanted = false
  private lastHoverAt = 0

  constructor() {
    super()
    const unlock = () => void this.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = THREE.AudioContext.getContext() as unknown as AudioContext
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = 1
      this.masterGain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  public async unlock(): Promise<void> {
    try {
      const ctx = this.getCtx()
      if (ctx.state === 'suspended') await ctx.resume()
      if (!this.unlocked) {
        const silent = ctx.createBuffer(1, 1, ctx.sampleRate)
        const src = ctx.createBufferSource()
        src.buffer = silent
        src.connect(this.masterGain)
        src.start(0)
        this.unlocked = true
      }
      if (this.menuMusicWanted) void this.startMenuMusic()
    } catch {
      /* ignore */
    }
  }

  /** Looping menu theme — menus only, never during loading / match */
  public async startMenuMusic(): Promise<void> {
    this.menuMusicWanted = true
    await this.unlock()
    try {
      if (!this.menuMusic) {
        this.menuMusic = new Audio('/kosmenusong.mp3')
        this.menuMusic.loop = true
        this.menuMusic.preload = 'auto'
        this.menuMusic.volume = 0.38
      }
      if (this.menuMusic.paused) {
        await this.menuMusic.play()
      }
    } catch {
      /* autoplay blocked until next gesture — unlock() retries */
    }
  }

  public stopMenuMusic(): void {
    this.menuMusicWanted = false
    if (!this.menuMusic) return
    try {
      this.menuMusic.pause()
      this.menuMusic.currentTime = 0
    } catch {
      /* ignore */
    }
  }

  /** Soft hover tick for menu buttons */
  public playMenuHover(): void {
    const now = performance.now()
    if (now - this.lastHoverAt < 55) return
    this.lastHoverAt = now
    this.playId('weapon_select', 0.55)
  }

  public startLoading(): void {
    if (this.loadStarted) return
    this.loadStarted = true
    // Decode everything up front (pack is tiny now) so first hit/kill never stutters
    void Promise.all(PRIORITY.map((id) => this.ensureBuffer(id)))
  }

  public async loadPriority(): Promise<void> {
    this.startLoading()
    await Promise.all(PRIORITY.map((id) => this.ensureBuffer(id)))
  }

  public async warmPlayback(): Promise<void> {
    await this.unlock()
    // Touch each buffer through the audio graph so first real shot isn't cold
    for (const id of ['ak_shot', 'usp_shot', 'flesh_bullet1', 'headshot1', 'death1', 'empty_rifle'] as SoundId[]) {
      const buffer = this.buffers.get(id)
      if (!buffer) continue
      try {
        const ctx = this.getCtx()
        const src = ctx.createBufferSource()
        src.buffer = buffer
        const gain = ctx.createGain()
        gain.gain.value = 0.0001
        src.connect(gain)
        gain.connect(this.masterGain)
        src.start(0)
        src.stop(ctx.currentTime + 0.02)
      } catch {
        /* ignore */
      }
    }
  }

  public loadRestInBackground(): void {
    this.startLoading()
  }

  public async load(): Promise<void> {
    this.startLoading()
  }

  private soundUrl(rel: string): string {
    return new URL(`../../sounds/${rel}`, import.meta.url).href
  }

  private async ensureBuffer(id: SoundId): Promise<AudioBuffer | undefined> {
    if (this.buffers.has(id)) return this.buffers.get(id)
    if (this.loading.has(id)) {
      while (this.loading.has(id)) await new Promise((r) => setTimeout(r, 10))
      return this.buffers.get(id)
    }

    const rel = SOUND_FILES[id]
    if (!rel) return undefined
    this.loading.add(id)
    try {
      const ctx = this.getCtx()
      const res = await fetch(this.soundUrl(rel))
      const arr = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arr.slice(0))
      this.buffers.set(id, buffer)
      return buffer
    } catch (err) {
      console.warn(`[Audio] failed ${rel}`, err)
      return undefined
    } finally {
      this.loading.delete(id)
    }
  }

  private defaultVolume(id: SoundId): number {
    if (id.startsWith('foot_')) return 0.38
    if (id === 'ak_shot') return 0.55
    if (id === 'usp_shot') return 0.6
    if (id.startsWith('knife_')) return 0.5
    if (id.startsWith('empty_')) return 0.45
    if (id === 'jump') return 0.32
    if (id === 'land') return 0.38
    if (id === 'weapon_select') return 0.32
    if (id.startsWith('flesh_')) return 0.72
    if (id.startsWith('headshot') || id === 'helmet_hit') return 0.85
    if (id.startsWith('death')) return 0.65
    if (id.startsWith('pain')) return 0.45
    return 0.48
  }

  private pick<T extends SoundId>(ids: T[]): T {
    return ids[Math.floor(Math.random() * ids.length)]
  }

  /** KoS flesh impact when a bullet hits a bot */
  public playFleshHit(isHead = false): Promise<void> {
    // Cap concurrent one-shots — overlapping decode/play caused first-hit freezes
    this.playId(
      this.pick(['flesh_bullet1', 'flesh_bullet2', 'flesh_bullet3', 'flesh_bullet4', 'flesh_bullet5']),
      isHead ? 1.05 : 1
    )
    if (isHead) {
      this.playId(this.pick(['headshot1', 'headshot2']), 1)
    } else {
      this.playId(this.pick(['pain5', 'pain6', 'pain7']), 0.55)
    }
    return Promise.resolve()
  }

  public playBotDeath(): Promise<void> {
    this.playId(this.pick(['death1', 'death2', 'death3']))
    return Promise.resolve()
  }

  /** Player POV death — same pack, slightly louder */
  public playPlayerDeath(): Promise<void> {
    this.playId(this.pick(['death1', 'death2', 'death3']), 1.15)
    return Promise.resolve()
  }

  private playId(id: SoundId, volumeScale = 1): void {
    void this.unlock()
    const buffer = this.buffers.get(id)
    if (!buffer) {
      // Fire as soon as decoded (first spray bullets may be silent for ~50ms)
      void this.ensureBuffer(id).then((b) => {
        if (b) this.playBuffer(id, b, volumeScale)
      })
      return
    }
    this.playBuffer(id, buffer, volumeScale)
  }

  private playBuffer(
    id: SoundId,
    buffer: AudioBuffer,
    volumeScale: number,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    try {
      const ctx = this.getCtx()
      if (ctx.state === 'suspended') void ctx.resume()

      const src = ctx.createBufferSource()
      src.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = Math.min(1, this.defaultVolume(id) * volumeScale)

      if (worldPos) {
        // Headphones: HRTF stereo + distance falloff (far = quiet / silent)
        const panner = ctx.createPanner()
        panner.panningModel = 'HRTF'
        panner.distanceModel = 'inverse'
        panner.refDistance = 4
        panner.maxDistance = 72
        panner.rolloffFactor = 1.35
        panner.coneInnerAngle = 360
        panner.coneOuterAngle = 360
        panner.coneOuterGain = 0
        if (typeof panner.positionX !== 'undefined') {
          panner.positionX.value = worldPos.x
          panner.positionY.value = worldPos.y
          panner.positionZ.value = worldPos.z
        } else {
          // Safari / older WebKit
          ;(panner as PannerNode & { setPosition: (x: number, y: number, z: number) => void }).setPosition(
            worldPos.x,
            worldPos.y,
            worldPos.z
          )
        }
        src.connect(gain)
        gain.connect(panner)
        panner.connect(this.masterGain)
        src.start(0)
        src.onended = () => {
          src.disconnect()
          gain.disconnect()
          panner.disconnect()
        }
        return
      }

      src.connect(gain)
      gain.connect(this.masterGain)
      src.start(0)
      src.onended = () => {
        src.disconnect()
        gain.disconnect()
      }
    } catch {
      /* ignore */
    }
  }

  private clearReloadTimers(): void {
    for (const t of this.reloadTimers) window.clearTimeout(t)
    this.reloadTimers = []
  }

  /**
   * Gunshot. Pass world position for spatial / distance audio (bots).
   * Omit position for local player shots (full volume, no panning).
   */
  public playShot(weaponKey = 'AK47', worldPos?: { x: number; y: number; z: number }): Promise<void> {
    if (weaponKey === 'Knife') {
      this.playKnife()
      return Promise.resolve()
    }
    const id: SoundId = weaponKey === 'Usp' ? 'usp_shot' : 'ak_shot'
    // Slightly quieter when spatial so close shots don't clip vs own fire
    const scale = worldPos ? 0.92 : 1
    void this.unlock()
    const buffer = this.buffers.get(id)
    if (!buffer) {
      void this.ensureBuffer(id).then((b) => {
        if (b) this.playBuffer(id, b, scale, worldPos)
      })
      return Promise.resolve()
    }
    this.playBuffer(id, buffer, scale, worldPos)
    return Promise.resolve()
  }

  public playFootstep(volumeScale = 1): Promise<void> {
    const feet: SoundId[] = ['foot_tile1', 'foot_tile2', 'foot_tile3']
    this.playId(feet[this.footIndex % feet.length], volumeScale)
    this.footIndex++
    return Promise.resolve()
  }

  public playReload(weaponKey = 'AK47'): Promise<void> {
    this.clearReloadTimers()
    if (weaponKey === 'Usp') {
      this.playId('usp_clipout')
      this.reloadTimers.push(
        window.setTimeout(() => this.playId('usp_clipin'), 450),
        window.setTimeout(() => this.playId('usp_slideback'), 900),
        window.setTimeout(() => this.playId('usp_sliderelease'), 1200)
      )
      return Promise.resolve()
    }
    if (weaponKey === 'Knife') return Promise.resolve()
    this.playId('ak_clipout')
    this.reloadTimers.push(
      window.setTimeout(() => this.playId('ak_clipin'), 550),
      window.setTimeout(() => this.playId('ak_boltpull'), 1100)
    )
    return Promise.resolve()
  }

  public playSwitch(weaponKey = 'AK47'): Promise<void> {
    this.clearReloadTimers()
    this.playId('weapon_select', 0.7)
    if (weaponKey === 'Usp') this.playId('usp_draw')
    else if (weaponKey === 'Knife') this.playId('knife_deploy')
    else this.playId('ak_draw')
    return Promise.resolve()
  }

  public playKnife(): Promise<void> {
    this.playId(Math.random() < 0.5 ? 'knife_slash' : 'knife_slash2')
    return Promise.resolve()
  }

  public playKnifeHit(): Promise<void> {
    this.playId('knife_hit')
    return Promise.resolve()
  }

  public playEmpty(weaponKey = 'AK47'): Promise<void> {
    this.playId(weaponKey === 'Usp' ? 'empty_pistol' : 'empty_rifle')
    return Promise.resolve()
  }

  public playJump(): Promise<void> {
    this.playId('jump', 0.85)
    return Promise.resolve()
  }

  public playLand(): Promise<void> {
    this.playId('land')
    return Promise.resolve()
  }
}
