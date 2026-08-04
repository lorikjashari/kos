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
  | 'awp_shot'
  | 'awp_shot2'
  | 'awp_shot3'
  | 'awp_shot_distant'
  | 'awp_draw'
  | 'awp_clipout'
  | 'awp_clipin'
  | 'awp_cliphit'
  | 'awp_boltback'
  | 'awp_boltforward'
  | 'awp_zoom'
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
  ak_shot: 'weapons/ak47/ak47-1.m4a',
  ak_draw: 'weapons/ak47/ak47_draw.m4a',
  ak_clipout: 'weapons/ak47/ak47_clipout.m4a',
  ak_clipin: 'weapons/ak47/ak47_clipin.m4a',
  ak_boltpull: 'weapons/ak47/ak47_boltpull.m4a',
  usp_shot: 'weapons/usp/usp1.m4a',
  usp_draw: 'weapons/usp/usp_draw.m4a',
  usp_clipout: 'weapons/usp/usp_clipout.m4a',
  usp_clipin: 'weapons/usp/usp_clipin.m4a',
  usp_slideback: 'weapons/usp/usp_slideback.m4a',
  usp_sliderelease: 'weapons/usp/usp_sliderelease.m4a',
  awp_shot: 'weapons/awp/awp1.m4a',
  awp_shot2: 'weapons/awp/awp_01.m4a',
  awp_shot3: 'weapons/awp/awp_02.m4a',
  awp_shot_distant: 'weapons/awp/awp1-distant.m4a',
  awp_draw: 'weapons/awp/awp_draw.m4a',
  awp_clipout: 'weapons/awp/awp_clipout.m4a',
  awp_clipin: 'weapons/awp/awp_clipin.m4a',
  awp_cliphit: 'weapons/awp/awp_cliphit.m4a',
  awp_boltback: 'weapons/awp/awp_boltback.m4a',
  awp_boltforward: 'weapons/awp/awp_boltforward.m4a',
  awp_zoom: 'weapons/awp/zoom.m4a',
  knife_slash: 'weapons/knife/knife_slash1.m4a',
  knife_slash2: 'weapons/knife/knife_slash2.m4a',
  knife_deploy: 'weapons/knife/knife_deploy1.m4a',
  knife_hit: 'weapons/knife/knife_hit1.m4a',
  empty_rifle: 'weapons/clipempty_rifle.m4a',
  empty_pistol: 'weapons/clipempty_pistol.m4a',
  foot_tile1: 'player/footsteps/tile1.m4a',
  foot_tile2: 'player/footsteps/tile2.m4a',
  foot_tile3: 'player/footsteps/tile3.m4a',
  jump: 'player/jumplanding.m4a',
  land: 'player/jumplanding2.m4a',
  weapon_select: 'common/wpn_select.m4a',
  flesh_bullet1: 'physics/flesh/flesh_impact_bullet1.m4a',
  flesh_bullet2: 'physics/flesh/flesh_impact_bullet2.m4a',
  flesh_bullet3: 'physics/flesh/flesh_impact_bullet3.m4a',
  flesh_bullet4: 'physics/flesh/flesh_impact_bullet4.m4a',
  flesh_bullet5: 'physics/flesh/flesh_impact_bullet5.m4a',
  headshot1: 'player/headshot1.m4a',
  headshot2: 'player/headshot2.m4a',
  helmet_hit: 'player/bhit_helmet-1.m4a',
  death1: 'player/death1.m4a',
  death2: 'player/death2.m4a',
  death3: 'player/death3.m4a',
  pain5: 'player/pl_pain5.m4a',
  pain6: 'player/pl_pain6.m4a',
  pain7: 'player/pl_pain7.m4a',
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
  private awpBoltTimers: number[] = []
  private masterGain!: GainNode
  private masterVolume = 1
  private musicVolume = 0.38
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
      this.masterGain.gain.value = this.masterVolume
      this.masterGain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  /**
   * HRTF panners are convolution nodes — building one per bot shot / footstep was
   * costing real time on every spatial sound. Cycle a fixed ring instead.
   */
  private pannerPool: PannerNode[] = []
  private pannerCursor = 0
  private static readonly PANNER_POOL_SIZE = 24

  private buildPanner(ctx: AudioContext): PannerNode {
    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 4
    panner.maxDistance = 72
    panner.rolloffFactor = 1.35
    panner.coneInnerAngle = 360
    panner.coneOuterAngle = 360
    panner.coneOuterGain = 0
    panner.connect(this.masterGain)
    return panner
  }

  public warmPanners(): void {
    const ctx = this.getCtx()
    while (this.pannerPool.length < AudioManager.PANNER_POOL_SIZE) {
      this.pannerPool.push(this.buildPanner(ctx))
    }
  }

  private takePanner(ctx: AudioContext, worldPos: { x: number; y: number; z: number }): PannerNode {
    if (this.pannerPool.length < AudioManager.PANNER_POOL_SIZE) this.warmPanners()
    const panner = this.pannerPool[this.pannerCursor % this.pannerPool.length] ?? this.buildPanner(ctx)
    this.pannerCursor++
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
    return panner
  }

  /** Master SFX volume 0..1 (console: volume). */
  public setSfxVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v))
    this.getCtx()
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume
  }

  public getSfxVolume(): number {
    return this.masterVolume
  }

  /** Menu/background music volume 0..1 (console: MP3Volume / bgmvolume). */
  public setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v))
    if (this.menuMusic) this.menuMusic.volume = this.musicVolume
  }

  public getMusicVolume(): number {
    return this.musicVolume
  }

  public async unlock(): Promise<void> {
    try {
      const ctx = this.getCtx()
      if (ctx.state === 'suspended') {
        // iOS Safari can hang forever on resume() without a user gesture
        await Promise.race([
          ctx.resume().then(() => undefined).catch(() => undefined),
          new Promise<void>((r) => setTimeout(r, 400)),
        ])
      }
      if (!this.unlocked) {
        try {
          const silent = ctx.createBuffer(1, 1, ctx.sampleRate)
          const src = ctx.createBufferSource()
          src.buffer = silent
          src.connect(this.masterGain)
          src.start(0)
        } catch {
          /* context may still be suspended — unlock on next gesture */
        }
        this.unlocked = true
      }
      if (this.menuMusicWanted) void this.resumeMenuMusicElement()
    } catch {
      /* ignore */
    }
  }

  private async resumeMenuMusicElement(): Promise<void> {
    try {
      if (!this.menuMusic) {
        this.menuMusic = new Audio('/kosmenusong.m4a')
        this.menuMusic.loop = true
        this.menuMusic.preload = 'auto'
        this.menuMusic.volume = this.musicVolume
      }
      if (this.menuMusic.paused) {
        await this.menuMusic.play()
      }
    } catch {
      /* autoplay blocked until next gesture */
    }
  }

  public async startMenuMusic(): Promise<void> {
    this.menuMusicWanted = true
    await this.unlock()
    await this.resumeMenuMusicElement()
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
    // Don't let one stalled decode hang the whole boot (common on flaky mobile nets)
    await Promise.race([
      Promise.allSettled(PRIORITY.map((id) => this.ensureBuffer(id))),
      new Promise<void>((r) => setTimeout(r, 12000)),
    ])
  }

  public async warmPlayback(): Promise<void> {
    await this.unlock()
    await Promise.race([
      Promise.allSettled(PRIORITY.map((id) => this.ensureBuffer(id))),
      new Promise<void>((r) => setTimeout(r, 8000)),
    ])

    const ctx = this.getCtx()
    if (ctx.state === 'suspended') {
      await Promise.race([
        ctx.resume().then(() => undefined).catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, 300)),
      ])
    }

    this.warmPanners()
    // Warm gun/foot graph shapes only. Death/pain/flesh are already decoded above —
    // priming them into the speakers (even at tiny gain) was audible on load.
    for (const id of PRIORITY) {
      if (
        id.startsWith('death') ||
        id.startsWith('pain') ||
        id.startsWith('flesh_') ||
        id.startsWith('headshot') ||
        id === 'helmet_hit'
      ) {
        continue
      }
      const buffer = this.buffers.get(id)
      if (!buffer) continue
      this.warmOneShot(ctx, buffer, { x: 0, y: -50, z: 0 })
      this.warmOneShot(ctx, buffer)
    }
  }

  private warmOneShot(
    ctx: AudioContext,
    buffer: AudioBuffer,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    try {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const gain = ctx.createGain()
      // Exact silence — some devices still leaked ~0.0001 as a click/whisper.
      gain.gain.value = 0
      src.connect(gain)
      if (worldPos) gain.connect(this.takePanner(ctx, worldPos))
      else gain.connect(this.masterGain)
      src.start(0)
      src.stop(ctx.currentTime + 0.015)
    } catch {
      /* ignore */
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
    if (id.startsWith('awp_shot')) return 0.72
    if (id === 'awp_zoom') return 0.45
    if (id.startsWith('awp_')) return 0.55
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

  /** Armor/helmet ping when a headshot is partially absorbed */
  public playHelmetHit(): Promise<void> {
    this.playId('helmet_hit', 1)
    return Promise.resolve()
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
        const panner = this.takePanner(ctx, worldPos)
        src.connect(gain)
        gain.connect(panner)
        src.start(0)
        src.onended = () => {
          src.disconnect()
          gain.disconnect()
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

  public clearAwpBoltTimers(): void {
    for (const t of this.awpBoltTimers) window.clearTimeout(t)
    this.awpBoltTimers = []
  }

  /** Post-shot AWP bolt: unscope window → bolt SFX → onComplete (re-zoom). */
  public playAwpBoltCycle(onComplete: () => void): void {
    this.clearAwpBoltTimers()
    this.awpBoltTimers.push(
      window.setTimeout(() => this.playId('awp_boltback'), 380),
      window.setTimeout(() => this.playId('awp_boltforward'), 620),
      window.setTimeout(() => {
        this.awpBoltTimers = []
        onComplete()
      }, 780)
    )
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
    let id: SoundId
    if (weaponKey === 'Usp') {
      id = 'usp_shot'
    } else if (weaponKey === 'AWP') {
      id = worldPos
        ? 'awp_shot_distant'
        : this.pick(['awp_shot', 'awp_shot2', 'awp_shot3'])
    } else {
      id = 'ak_shot'
    }
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

  /** Spatial footstep for bots — distance falloff so far steps are faint/silent. */
  public playFootstepAt(worldPos: { x: number; y: number; z: number }, volumeScale = 1): Promise<void> {
    const feet: SoundId[] = ['foot_tile1', 'foot_tile2', 'foot_tile3']
    const id = feet[this.footIndex % feet.length]
    this.footIndex++
    void this.unlock()
    const buffer = this.buffers.get(id)
    if (!buffer) {
      void this.ensureBuffer(id).then((b) => {
        if (b) this.playBuffer(id, b, volumeScale, worldPos)
      })
      return Promise.resolve()
    }
    this.playBuffer(id, buffer, volumeScale, worldPos)
    return Promise.resolve()
  }

  public playReload(weaponKey = 'AK47'): Promise<void> {
    this.clearReloadTimers()
    this.clearAwpBoltTimers()
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
    if (weaponKey === 'AWP') {
      this.playId('awp_clipout')
      this.reloadTimers.push(
        window.setTimeout(() => this.playId('awp_clipin'), 600),
        window.setTimeout(() => this.playId('awp_cliphit'), 950),
        window.setTimeout(() => this.playId('awp_boltback'), 1600),
        window.setTimeout(() => this.playId('awp_boltforward'), 2000)
      )
      return Promise.resolve()
    }
    this.playId('ak_clipout')
    this.reloadTimers.push(
      window.setTimeout(() => this.playId('ak_clipin'), 550),
      window.setTimeout(() => this.playId('ak_boltpull'), 1100)
    )
    return Promise.resolve()
  }

  public playSwitch(weaponKey = 'AK47'): Promise<void> {
    this.clearReloadTimers()
    this.clearAwpBoltTimers()
    this.playId('weapon_select', 0.7)
    if (weaponKey === 'Usp') this.playId('usp_draw')
    else if (weaponKey === 'Knife') this.playId('knife_deploy')
    else if (weaponKey === 'AWP') this.playId('awp_draw')
    else this.playId('ak_draw')
    return Promise.resolve()
  }

  public playZoom(volumeScale = 1): Promise<void> {
    this.playId('awp_zoom', volumeScale)
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
