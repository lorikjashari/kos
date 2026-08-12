import * as THREE from 'three'
import type { MDLHandRetargeter } from './MDLHandRetargeter'
import type { MDLMeshPart, MDLSequenceInfo } from './loadGoldSrcMDL'

/** CPU-baked frame playback for GoldSrc MDL viewmodels (web-hlmv style). */
export class MDLFramePlayer {
  private seqIndex = 0
  private time = 0
  private playing = false
  private loop = false
  private timeScale = 1
  private duration = 0

  /** Drives M9 GLB bones from CS MDL cshands during knife frame playback. */
  public handRetargeter: MDLHandRetargeter | null = null

  private heldSeqIndex = 0
  private heldFrame = 0

  constructor(
    private parts: MDLMeshPart[],
    private sequences: MDLSequenceInfo[],
    private restSeqIndex: number,
    private restFrame: number
  ) {}

  public findSequence(name: string): number {
    const lower = name.toLowerCase()
    return this.sequences.findIndex((s) => s.label === name || s.label.toLowerCase() === lower)
  }

  public play(name: string, loop = false, timeScale = 1): number {
    const idx = this.findSequence(name)
    if (idx < 0) return 0

    this.seqIndex = idx
    this.loop = loop
    this.timeScale = timeScale
    this.time = 0
    this.playing = true
    this.duration = this.sequences[idx]!.duration / Math.max(0.05, timeScale)

    this.applyFrame(0)
    return this.duration
  }

  /** Idle ready pose — last frame of the draw sequence. */
  public holdRest(): void {
    this.playing = false
    this.time = 0
    this.duration = 0
    this.seqIndex = this.restSeqIndex
    this.applyFrameAt(this.restSeqIndex, this.restFrame)
  }

  /** Pre-draw — first frame of the draw sequence (knife folded). */
  public holdDrawStart(): void {
    this.holdSequenceFrame('draw', 0)
  }

  public holdSequenceFrame(name: string, frame: number): void {
    const idx = this.findSequence(name)
    if (idx < 0) return

    this.seqIndex = idx
    this.playing = false
    this.time = 0
    this.duration = 0

    const seq = this.sequences[idx]!
    const f = Math.min(seq.numFrames - 1, Math.max(0, frame))
    this.applyFrameAt(idx, f)
  }

  /** Freeze on the last frame of a clip (slash follow-through hold). */
  public holdClipEnd(name: string): void {
    const idx = this.findSequence(name)
    if (idx < 0) return
    const seq = this.sequences[idx]!
    this.holdSequenceFrame(name, seq.numFrames - 1)
  }

  public getSequenceDuration(name: string, timeScale = 1): number {
    const idx = this.findSequence(name)
    if (idx < 0) return 0
    return this.sequences[idx]!.duration / Math.max(0.05, timeScale)
  }

  public hold(name: string, normalizedTime = 0): void {
    const idx = this.findSequence(name)
    if (idx < 0) return

    this.seqIndex = idx
    this.playing = false
    this.time = 0
    this.duration = 0

    const seq = this.sequences[idx]!
    const frame = Math.min(seq.numFrames - 1, Math.floor(normalizedTime * (seq.numFrames - 1)))
    this.applyFrameAt(idx, frame)
  }

  public update(dt: number): void {
    if (this.playing) {
      const seq = this.sequences[this.seqIndex]!
      this.time += dt * this.timeScale

      if (this.time >= seq.duration) {
        if (this.loop) {
          this.time %= seq.duration
        } else {
          this.time = seq.duration
          this.playing = false
          this.holdCurrentPlayingFrame()
        }
      }

      if (this.playing) {
        this.applySmoothFrame(this.seqIndex, this.time, seq)
      } else {
        this.refreshHandRetargeter()
      }
    } else {
      this.refreshHandRetargeter()
    }
  }

  /** Pin hands + knife to the frame we ended on. */
  private holdCurrentPlayingFrame(): void {
    const seq = this.sequences[this.seqIndex]
    if (!seq) return
    const raw = this.time * seq.fps
    const f = Math.min(seq.numFrames - 1, Math.max(0, Math.floor(raw)))
    this.applyFrameAt(this.seqIndex, f)
  }

  /** Re-apply cshands retarget for the held frame (prevents GLB mixer from freezing hands). */
  public refreshHandRetargeter(): void {
    const r = this.handRetargeter
    if (!r || this.playing) return
    const seq = this.sequences[this.heldSeqIndex]
    if (!seq) return
    r.applyFrames(this.heldSeqIndex, this.heldFrame, seq, 0)
  }

  public getDuration(): number {
    return this.duration
  }

  public isPlaying(): boolean {
    return this.playing
  }

  /** 0→1 progress through the active sequence (for draw visibility gating). */
  public getSequenceProgress(): number {
    const seq = this.sequences[this.seqIndex]
    if (!seq || seq.duration <= 0) return 1
    return Math.min(1, Math.max(0, this.time / seq.duration))
  }

  private blendScratch = new WeakMap<MDLMeshPart, Float32Array>()

  private applySmoothFrame(seqIndex: number, time: number, seq: MDLSequenceInfo): void {
    const raw = time * seq.fps
    const f0 = Math.min(seq.numFrames - 1, Math.max(0, Math.floor(raw)))
    const f1 = Math.min(seq.numFrames - 1, f0 + 1)
    const t = Math.min(1, Math.max(0, raw - f0))
    this.applyFrameBlend(seqIndex, f0, f1, t)
  }

  private applyFrame(frame: number): void {
    this.applyFrameAt(this.seqIndex, frame)
  }

  private applyFrameBlend(seqIndex: number, frameA: number, frameB: number, t: number): void {
    for (const part of this.parts) {
      const a = part.framePositions[seqIndex]?.[frameA]
      if (!a) continue

      const attr = part.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      const dst = attr.array as Float32Array

      if (t <= 0 || frameA === frameB) {
        dst.set(a)
      } else {
        const b = part.framePositions[seqIndex]?.[frameB]
        if (!b) {
          dst.set(a)
        } else {
          let scratch = this.blendScratch.get(part)
          if (!scratch || scratch.length !== a.length) {
            scratch = new Float32Array(a.length)
            this.blendScratch.set(part, scratch)
          }
          for (let i = 0; i < a.length; i++) {
            scratch[i] = a[i] + (b[i] - a[i]!) * t
          }
          dst.set(scratch)
        }
      }
      attr.needsUpdate = true
    }
    this.syncHandRetargeter(seqIndex, frameA, t)
  }

  private applyFrameAt(seqIndex: number, frame: number): void {
    for (const part of this.parts) {
      const positions = part.framePositions[seqIndex]?.[frame]
      if (!positions) continue

      const attr = part.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      ;(attr.array as Float32Array).set(positions)
      attr.needsUpdate = true
    }
    this.syncHandRetargeter(seqIndex, frame, 0)
  }

  private syncHandRetargeter(seqIndex: number, frameA: number, blendT: number): void {
    this.heldSeqIndex = seqIndex
    this.heldFrame = frameA
    const r = this.handRetargeter
    if (!r) return
    const seq = this.sequences[seqIndex]
    if (!seq) return
    r.applyFrames(seqIndex, frameA, seq, blendT)
  }
}
