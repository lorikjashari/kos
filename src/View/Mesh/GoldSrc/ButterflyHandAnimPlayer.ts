import * as THREE from 'three'
import type { FPSMesh } from '../FPSMesh'
import { calcLocalBoneQuaternion } from './MDLRig'
import type { MDLModelData, MDLBone, MDLSequence } from './MDLTypes'

const HAND_SEQS = ['draw', 'midslash1', 'midslash2'] as const

function isCshandsMdlBone(name: string): boolean {
  return name.includes('Bip01') && !name.includes('ForeTwist')
}

function collectCshandsChain(model: MDLModelData): number[] {
  const indices: number[] = []
  const visit = (bone: MDLBone, index: number): void => {
    if (isCshandsMdlBone(bone.name)) indices.push(index)
    for (let i = 0; i < model.bones.length; i++) {
      if (model.bones[i]!.parent === index) visit(model.bones[i]!, i)
    }
  }
  const root = model.bones.findIndex((b) => b.name === 'v_weapon')
  if (root >= 0) visit(model.bones[root]!, root)
  return indices
}

function compositeDeltaQuat(
  model: MDLModelData,
  seq: MDLSequence,
  frame: number,
  restSeq: MDLSequence,
  restFrame: number,
  chain: number[]
): THREE.Quaternion {
  let combined = new THREE.Quaternion()
  for (const idx of chain) {
    const q = calcLocalBoneQuaternion(model, seq, frame, idx)
    const qRest = calcLocalBoneQuaternion(model, restSeq, restFrame, idx)
    combined.multiply(q.clone().multiply(qRest.invert()))
  }
  return combined
}

/** Delta quaternions (identity = draw ready). Premultiply glbRest at playback. */
export function buildMdlHandAnimationClips(
  model: MDLModelData,
  boneTrackName: string
): Map<string, THREE.AnimationClip> {
  const clips = new Map<string, THREE.AnimationClip>()
  const sequences = model.sequences.filter((s) => s.numFrames > 0)
  const drawSeq = sequences.find((s) => s.label === 'draw')
  if (!drawSeq) return clips

  const restFrame = Math.max(0, drawSeq.numFrames - 1)
  const chain = collectCshandsChain(model)
  if (chain.length === 0) return clips

  for (const seq of sequences) {
    if (!HAND_SEQS.includes(seq.label as (typeof HAND_SEQS)[number])) continue

    const times: number[] = []
    const values: number[] = []

    for (let f = 0; f < seq.numFrames; f++) {
      const q = compositeDeltaQuat(model, seq, f, drawSeq, restFrame, chain)
      times.push(f / Math.max(1, seq.fps))
      values.push(q.x, q.y, q.z, q.w)
    }

    const track = new THREE.QuaternionKeyframeTrack(
      `${boneTrackName}.quaternion`,
      times,
      values
    )
    const dur = times[times.length - 1] ?? 0.05
    clips.set(seq.label, new THREE.AnimationClip(`bf_${seq.label}`, dur, [track]))
  }

  return clips
}

/** Freeze M9 GLB at Switch end without touching baked bf_* hand clips. */
export function holdM9SwitchEndPose(fps: FPSMesh): void {
  fps.mixer?.stopAllAction()
  const sw = fps.animations.get('Switch')
  const time = sw?.End?.time ?? 2.3
  if (!fps.mixer || !fps.mesh?.animations?.length) return

  for (const clip of fps.mesh.animations) {
    if (clip.name.startsWith('bf_')) continue
    const action = fps.mixer.clipAction(clip)
    action.reset()
    action.enabled = true
    action.loop = THREE.LoopOnce
    action.clampWhenFinished = true
    action.timeScale = 1
    action.time = Math.max(0, Math.min(time, clip.duration))
    action.paused = true
    action.play()
  }
  fps.mixer.update(0)
}

export function discoverHandBoneTrackName(viewmodelRoot: THREE.Object3D): string {
  let found = 'Root'
  viewmodelRoot.traverse((c) => {
    const sk = c as THREE.SkinnedMesh
    if (!sk.isSkinnedMesh || !sk.skeleton?.bones.length) return
    const rootBone =
      sk.skeleton.bones.find((b) => b.name === 'Root') ?? sk.skeleton.bones[0]
    if (rootBone) found = rootBone.name
  })
  return found
}

export function findHandAnimBone(viewmodelRoot: THREE.Object3D): THREE.Object3D | null {
  const bones: THREE.Bone[] = []
  viewmodelRoot.traverse((c) => {
    if ((c as THREE.Bone).isBone) bones.push(c as THREE.Bone)
  })
  const rootBone = bones.find((b) => b.name === 'Root')
  if (rootBone) return rootBone

  let armature: THREE.Object3D | undefined
  viewmodelRoot.traverse((c) => {
    if (!armature && c.name === 'Armature') armature = c
  })
  return armature ?? bones[0] ?? null
}

/** CS MDL cshands → M9 GLB bone via baked quaternion clips. */
export class ButterflyHandAnimPlayer {
  private readonly clips: Map<string, THREE.AnimationClip>
  private readonly pivot: THREE.Object3D
  private readonly glbRestQuat: THREE.Quaternion
  private activeAction: THREE.AnimationAction | null = null

  constructor(
    private readonly fpsMesh: {
      mesh: THREE.Object3D
      mixer?: THREE.AnimationMixer
    },
    clips: Map<string, THREE.AnimationClip>,
    pivot: THREE.Object3D,
    glbRestQuat: THREE.Quaternion
  ) {
    this.clips = clips
    this.pivot = pivot
    this.glbRestQuat = glbRestQuat.clone()
  }

  public static create(
    fpsMesh: { mesh: THREE.Object3D; mixer?: THREE.AnimationMixer },
    model: MDLModelData
  ): ButterflyHandAnimPlayer | null {
    if (!fpsMesh.mixer) return null

    const pivot = findHandAnimBone(fpsMesh.mesh)
    if (!pivot) return null

    const trackName = discoverHandBoneTrackName(fpsMesh.mesh)
    const clips = buildMdlHandAnimationClips(model, trackName)
    if (clips.size === 0) return null

    for (const clip of clips.values()) {
      if (!fpsMesh.mesh.animations.some((a) => a.name === clip.name)) {
        fpsMesh.mesh.animations.push(clip)
      }
    }

    return new ButterflyHandAnimPlayer(fpsMesh, clips, pivot, pivot.quaternion.clone())
  }

  public play(name: string, timeScale = 1): number {
    const clip = this.clips.get(name)
    if (!clip || !this.fpsMesh.mixer) return 0

    this.fpsMesh.mixer.stopAllAction()
    this.fpsMesh.mixer.setTime(0)

    const action = this.fpsMesh.mixer.clipAction(clip)
    action.reset()
    action.enabled = true
    action.paused = false
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.timeScale = timeScale
    action.play()

    this.activeAction = action
    this.syncPivotFromMixer()

    return clip.duration / Math.max(0.05, timeScale)
  }

  public holdDrawStart(): void {
    this.holdAt('draw', 0)
  }

  public holdRest(): void {
    const clip = this.clips.get('draw')
    if (!clip) return
    this.holdAt('draw', clip.duration)
  }

  public holdClipEnd(name: string): void {
    const clip = this.clips.get(name)
    if (!clip) return
    this.holdAt(name, clip.duration)
  }

  private holdAt(name: string, time: number): void {
    const clip = this.clips.get(name)
    if (!clip || !this.fpsMesh.mixer) return

    this.fpsMesh.mixer.stopAllAction()
    const action = this.fpsMesh.mixer.clipAction(clip)
    action.reset()
    action.enabled = true
    action.paused = true
    action.clampWhenFinished = true
    action.time = Math.min(clip.duration, Math.max(0, time))
    action.play()

    this.activeAction = action
    this.syncPivotFromMixer()
  }

  public update(dt: number): void {
    if (!this.fpsMesh.mixer) return
    this.fpsMesh.mixer.update(dt)
    this.syncPivotFromMixer()
  }

  private syncPivotFromMixer(): void {
    if (!this.activeAction) return
    const clip = this.activeAction.getClip()
    const track = clip.tracks[0] as THREE.QuaternionKeyframeTrack | undefined
    if (!track) return

    const q = this.sampleTrack(track, this.activeAction.time)
    this.pivot.quaternion.copy(this.glbRestQuat).premultiply(q)
    this.fpsMesh.mesh.traverse((c) => {
      const sk = c as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) sk.skeleton?.update()
    })
    this.fpsMesh.mesh.updateMatrixWorld(true)
  }

  private sampleTrack(track: THREE.QuaternionKeyframeTrack, time: number): THREE.Quaternion {
    const times = track.times
    const values = track.values as Float32Array
    if (times.length === 0) return new THREE.Quaternion()

    let idx = 0
    while (idx + 1 < times.length && times[idx + 1]! <= time) idx++

    const out = new THREE.Quaternion()
    if (idx + 1 < times.length && times[idx + 1]! > times[idx]!) {
      const alpha = Math.min(1, Math.max(0, (time - times[idx]!) / (times[idx + 1]! - times[idx]!)))
      const q0 = new THREE.Quaternion(
        values[idx * 4]!,
        values[idx * 4 + 1]!,
        values[idx * 4 + 2]!,
        values[idx * 4 + 3]!
      )
      const q1 = new THREE.Quaternion(
        values[(idx + 1) * 4]!,
        values[(idx + 1) * 4 + 1]!,
        values[(idx + 1) * 4 + 2]!,
        values[(idx + 1) * 4 + 3]!
      )
      out.copy(q0).slerp(q1, alpha)
    } else {
      out.set(values[idx * 4]!, values[idx * 4 + 1]!, values[idx * 4 + 2]!, values[idx * 4 + 3]!)
    }
    return out
  }
}
