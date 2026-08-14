import * as THREE from 'three'
import { Vector3D } from '../../Core/Vector'
import { FPSMesh } from './FPSMesh'
import { MDLFramePlayer } from './GoldSrc/MDLFramePlayer'
import { loadGoldSrcMDL } from './GoldSrc/loadGoldSrcMDL'

/** FPS viewmodel backed by a GoldSrc MDL v10 (CS 1.6) — CPU-skinned like web-hlmv. */
export class MDLFPSMesh extends FPSMesh {
  private framePlayer!: MDLFramePlayer

  constructor(
    path: string,
    key: string,
    viewmodelOffset = Vector3D.ZERO(),
    invertScale = false
  ) {
    super(path, key, viewmodelOffset, invertScale)
  }

  public override async load(): Promise<void> {
    const { root, animations, parts, sequences, restSeqIndex, restFrame } = await loadGoldSrcMDL(this.path)
    this.framePlayer = new MDLFramePlayer(parts, sequences, restSeqIndex, restFrame)

    const mesh = root as unknown as THREE.Mesh & { animations?: THREE.AnimationClip[] }
    mesh.animations = animations
    this.setMesh(mesh)
    this.init()
    this.holdPoseAt(0)
  }

  public override async loadAnimationMarkers(): Promise<void> {
    // CS 1.6 MDL clips are embedded — no sidecar JSON.
  }

  public override init(): void {
    super.init()
    this.initMdlMesh()
  }

  public override update(dt: number): void {
    if (this.framePlayer?.isPlaying()) {
      this.framePlayer.update(dt)
      if (!this.framePlayer.isPlaying()) {
        this.lastAnimationDuration = 0
      }
    }
  }

  public override holdPoseAt(_time = 0): void {
    this.framePlayer?.holdRest()
    this.lastAnimationDuration = 0
  }

  public override settlePose(): void {
    // Frame already baked — nothing to settle.
  }

  public override playNamedClip(clipName: string, loop = false, timeScale = 1.0): number {
    if (!this.framePlayer) return 0

    const dur = this.framePlayer.play(clipName, loop, timeScale)
    this.lastAnimationDuration = dur
    return dur
  }

  public override initAnimation(): void {
    // CPU frame player — no Three.js AnimationMixer needed.
    this.mixer = { update: () => {}, stopAllAction: () => {}, time: 0, timeScale: 1 } as unknown as THREE.AnimationMixer
  }

  private initMdlMesh(): void {
    this.mesh.visible = true
    this.mesh.traverse((child) => {
      child.castShadow = false
      child.receiveShadow = false
      child.frustumCulled = false
    })
  }

  public override clone(): MDLFPSMesh {
    const clone = new MDLFPSMesh(this.path, this.key, this.viewmodelOffset, this.invertScale)
    clone.setMesh(this.cloneMesh())
    clone.setAnimations(this.animations)
    return clone
  }
}
